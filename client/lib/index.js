const config = require('../config');

const Bluebird = require('bluebird');
const retry = require('bluebird-retry');
const { exists } = require('fs-extra');
const md5 = require('md5-file');
const { fs, crypto } = require('mz');
const { constants } = require('os');
const { basename, dirname, isAbsolute, join } = require('path');
const progStream = require('progress-stream');
const request = require('request');
const rp = require('request-promise');
const pipeline = Bluebird.promisify(require('readable-stream').pipeline);
const { PassThrough } = require('stream');
const tar = require('tar-fs');
const tarStream = require('tar-stream');
const { parse } = require('url');
const WebSocket = require('ws');
const zlib = require('zlib');

async function isGzip(filePath) {
	const buf = Buffer.alloc(3);

	await fs.read(await fs.open(filePath, 'r'), buf, 0, 3, 0);

	return buf[0] === 0x1f && buf[1] === 0x8b && buf[2] === 0x08;
}

async function isZip(filepath) {
	const buf = Buffer.alloc(4);

	await fs.read(await fs.open(filepath, 'r'), buf, 0, 4, 0)
	
	// Referencing ZIP file signatures https://www.garykessler.net/library/file_sigs.html
	return buf[0] === 0x50 && buf[1] === 0x4B && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07) && (buf[3] === 0x04 || buf[3] === 0x06 || buf[3] === 0x08);
}

async function getFilesFromDirectory(basePath, ignore = []) {
	let files = [];

	const entries = await fs.readdir(basePath);

	for (const entry of entries) {
		if (ignore.includes(entry)) {
			continue;
		}

		const stat = await fs.stat(join(basePath, entry));

		if (stat.isFile()) {
			files.push(join(basePath, entry));
		}

		if (stat.isDirectory()) {
			files = files.concat(
				await getFilesFromDirectory(join(basePath, entry), ignore),
			);
		}
	}

	return files;
}

function makePath(p) {
	try {
		return isAbsolute(p) ? p : join(process.cwd(), p);
	} catch (e) {
		throw new Error(`Invalid path for file ${p}: ${e}`);
	}
}

module.exports = class Client extends PassThrough {
	constructor(uri, workdir) {
		super();
		this.uri = uri;
		let uriParsed = parse(uri);
		this.workdir = join(workdir, uriParsed.hostname);
		this.coreHost = config.core.host;
		this.corePort = config.core.port;
		this.coreUrl = `http://${this.coreHost}:${this.corePort}`;
	}

	status(data) {
		process.send({ type: 'status', data });
	}

	info(data) {
		process.send({ type: 'info', data });
	}

	log(data) {
		process.send({ type: 'log', data });
	}

	async handleArtifact(artifact, token, attempt) {
		if (attempt > 1) {
			this.log(
				`Previously failed to upload artifact ${artifact.name} - retrying...`,
			);
		}
		const ignore = ['node_modules'];

		// Sanity checks + sanity checks
		if (artifact.path != null) {
			try {
				const stat = await fs.stat(artifact.path);
				if (!stat[artifact.type]()) {
					throw new Error(`${artifact.path} does not satisfy ${artifact.type}`);
				}

				// Not a zip file or gzip file, then default to gzip compression for file upload
				if (artifact.name === 'os.img' && !(await isGzip(artifact.path)) && !(await isZip(artifact.path))) {
					const str = progStream({
						length: stat.size,
						time: 100,
					});
					str.on('progress', (progress) => {
						this.status({
							message: 'Gzipping Image',
							percentage: progress.percentage,
							eta: progress.eta,
						});
					});

					const gzippedPath = join(this.workdir, artifact.name);

					await pipeline(
						fs.createReadStream(artifact.path),
						str,
						zlib.createGzip({ level: 6 }),
						fs.createWriteStream(gzippedPath),
					);

					artifact.path = gzippedPath;
				}
			} catch (err) {
				console.log(err);
			}
		}

		// Upload with cache check in place
		this.log(`Handling artifact: ${artifact.name}`);
		this.log('Calculating hash');

		const metadata = { size: null, hash: null, stream: null };
		if (artifact.type === 'isDirectory') {
			const struct = await getFilesFromDirectory(artifact.path, ignore);

			const expand = await Promise.all(
				struct.map(async (entry) => {
					return {
						path: entry.replace(
							join(artifact.path, '/'),
							join(artifact.name, '/'),
						),
						md5: await md5(entry),
					};
				}),
			);
			expand.sort((a, b) => {
				const splitA = a.path.split('/');
				const splitB = b.path.split('/');
				return splitA.every((sub, i) => {
					return sub <= splitB[i];
				})
					? -1
					: 1;
			});
			metadata.hash = crypto
				.Hash('md5')
				.update(
					expand.reduce((acc, value) => {
						return acc + value.md5;
					}, ''),
				)
				.digest('hex');
			metadata.size = (await fs.stat(artifact.path)).size;
		}
		if (artifact.type === 'isFile') {
			metadata.hash = await md5(artifact.path);
			metadata.size = (await fs.stat(artifact.path)).size;
		}
		if (artifact.type === 'isJSON') {
			metadata.hash = crypto
				.Hash('md5')
				.update(`${artifact.data}\n`)
				.digest('hex');
			metadata.size = JSON.stringify(artifact.data).length;
		}

		const uploadOperation = () =>
			new Promise(async (resolve, reject) => {
				this.log(`Sending to the testbot device, attempt ${attempt}...`);

				if (artifact.type === 'isDirectory' || artifact.type === 'isFile') {
					metadata.stream = tar.pack(dirname(artifact.path), {
						ignore: function (name) {
							return ignore.some((value) => {
								const re = new RegExp(`.*${value}.*`);
								return re.test(name);
							});
						},
						map: function (header) {
							header.name = header.name.replace(
								basename(artifact.path),
								artifact.name,
							);
							return header;
						},
						entries: [basename(artifact.path)],
					});
				} else if (artifact.type === 'isJSON') {
					const serializedData = JSON.stringify(artifact.data);
					metadata.size = serializedData.length;
					metadata.stream = tarStream.pack();
					metadata.stream.entry({ name: artifact.name }, serializedData);
					metadata.stream.finalize();
				}

				const str = progStream({
					length: metadata.size,
					time: 100,
				});
				const req = request.post({
					uri: `${this.coreUrl}/upload`,
					headers: {
						'x-token': token,
						'x-artifact': artifact.name,
						'x-artifact-id': artifact.id,
						'x-artifact-hash': metadata.hash,
					},
				});

				req.on('end', resolve).on('error', reject);

				// We need to record the end of our pipe, so we can unpipe in case cache will be used
				const pipeEnd = zlib.createGzip({ level: 6 });
				const line = pipeline(metadata.stream, str, pipeEnd)
					.delay(1000)
					.catch((error) => {
						throw error;
					});
				pipeEnd.pipe(req);

				req.on('response', function (response) {
					if (Math.floor(response.statusCode / 100) !== 2) {
						reject(
							new Error('request failed with status: ' + response.statusCode),
						);
						req.abort();
					}
				});

				req.on('data', async (data) => {
					const computedLine = RegExp('^([a-z]*): (.*)').exec(data.toString());

					if (computedLine != null && computedLine[1] === 'error') {
						reject(new Error(computedLine[2]));
						req.abort();
					}
					if (computedLine != null && computedLine[1] === 'upload') {
						switch (computedLine[2]) {
							case 'start':
								this.status({
									message: 'Uploading',
									percentage: 0,
								});

								str.on('progress', (progress) => {
									this.status({
										message: 'Uploading',
										percentage: progress.percentage,
										eta: progress.eta,
									});
								});
								await line;
								break;
							case 'cache':
								pipeEnd.unpipe(req);
								this.log('[Cache used]');
								resolve();
								break;
							case 'done':
								// For uploads that are too fast we will not even catch the end, so let's display it now
								this.status({
									message: 'Uploaded',
									percentage: 100,
								});
								pipeEnd.unpipe(req);
								resolve();
								break;
						}
					}
				});
			});
		await uploadOperation();
	}

	run() {
		const main = async (suiteConfig) => {
			process.on('SIGINT', async () => {
				await rp.post(`${this.coreUrl}/stop`).catch(this.log.bind(this));
				process.exit(128 + constants.signals.SIGINT);
			});
			process.on('SIGTERM', async () => {
				await rp.post(`${this.coreUrl}/stop`).catch(this.log.bind(this));
				process.exit(128 + constants.signals.SIGTERM);
			});

			let heartbeatFailCounter = 0
			const heartbeat = setInterval(async () => {
				try{
					await rp.get(`${this.uri}/heartbeat`);
					heartbeatFailCounter = 0
				} catch{
					console.log(`Failed to ping worker hearbeat: ${heartbeatFailCounter} failures in a row`)
					heartbeatFailCounter += 1
					if(heartbeatFailCounter === 10){
						throw new Error(`Lost communication with worker! `)
					}
				}
			}, 1000 * 20);


			let capturedError = null;
			const wsMessageHandler = (wsConnection) => async (pkg) => {
				try {
					const { type, data } = JSON.parse(pkg);

					switch (type) {
						case 'upload':
							const { name, id, token, attempt } = data;

							const artifact = {
								name,
								id,
							};

							switch (id) {
								case 'suite':
									artifact.path = makePath(suiteConfig.suite);
									artifact.type = 'isDirectory';
									break;
								case 'kernelHeaders':
									if (suiteConfig.kernelHeaders !== undefined) {
										artifact.path = makePath(suiteConfig.kernelHeaders);
										artifact.type = 'isFile';
									} else {
									  this.log(`No kernelHeaders defined in config`);
										const fakeHeadersPath = '/home/test-headers';
										await fs.writeFile(fakeHeadersPath, '');
										artifact.path = makePath(fakeHeadersPath);
										artifact.type = 'isFile';
									}
									break;
								case 'image':
									// [Hack] Upload a fake image if image is false
									if (suiteConfig.image === false) {
										// Had to create fake image in home directory otherwise
										// facing a permission issue since client root is read-only
										const fakeImagePath = '/home/test-balena.img.gz';
										await fs.writeFile(fakeImagePath, '');
										artifact.path = makePath(fakeImagePath);
										artifact.type = 'isFile';
										break;
									}
									artifact.path = makePath(suiteConfig.image);
									artifact.type = 'isFile';
									break;
								case 'config':
									artifact.type = 'isJSON';
									artifact.data = null;
									if (typeof (suiteConfig) === 'object') {
										artifact.data = suiteConfig
									} else if (await exists(makePath(suiteConfig))) {
										artifact.data = require(makePath(suiteConfig));
									} else {
										artifact.data = suiteConfig
									}
									artifact.data.workerUrl = this.uri;
									break;
								default:
									throw new Error('Unexpected upload request. Panicking...');
							}
							await this.handleArtifact(artifact, token, attempt);
							break;
						case 'log':
							this.write(data);
							process.send({ type, data });
							break;
						case 'status':
							if (data.message === `Flashing`) {
								this.log(`Flashing: ${data.percentage}%`);
							} else if (!data.success) {
								this.log(`Test suite has exited with: FAIL`);
								process.exitCode = 2;
							} else {
								this.log(`Test suite has exited with: PASS`);
							}
							break;
						case 'error':
							process.exitCode = 3;
							process.send({ type, data });
							break;
						default:
							console.log(`Unexpected message received of type '${type}'`);
							process.send({ type, data });
					}
				} catch (e) {
					capturedError = e;
					ws.close();
					throw new Error(`[WSHandlerError] ${e}`);
				}
			};

			const createWs = () =>
				new Promise((resolve, reject) => {
					const wsConnection = new WebSocket(
						`ws://${this.coreHost}:${this.corePort}/start`,
					);

					const msgHandler = wsMessageHandler(wsConnection);
					wsConnection.on('message', msgHandler);

					const initialErrorHandler = (e) => {
						wsConnection.off('ping', initialPingHandler);
						reject(e);
					};
					const initialPingHandler = () => {
						wsConnection.pong('heartbeat');
						wsConnection.off('error', reject);
						resolve(wsConnection);
					};

					wsConnection.once('error', initialErrorHandler);
					wsConnection.once('ping', initialPingHandler);
				});

			// Try establishing the WS multiple times.
			const ws = await retry(createWs, { max_tries: 3 });

			// Keep the websocket alive
			ws.on('ping', () => ws.pong('heartbeat'));

			// And then await till it's closed.
			await new Promise((resolve, reject) => {
				if (capturedError) {
					reject(capturedError);
				}

				ws.on('error', (e) => {
					this.log(`WS connection error: ${e.name} ${e.message}`);
					reject(e);
				});
				ws.on('close', () => {
					this.log('WS connection is closed');
					process.stdin.destroy();
					if (capturedError) {
						reject(capturedError);
					} else {
						resolve();
					}
				});
			});
		};

		return main(...arguments)
			.catch(async (error) => {
				process.exitCode = 1;
				this.log(error);
				this.log(`Child ${process.pid} got an error:`);
			})
			.finally(async () => {
				console.log(`Exiting client process...`);
				process.exit();
			});
	}
};
