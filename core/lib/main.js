/*
 * Copyright 2017 balena
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const Bluebird = require('bluebird');
const { fork } = require('child_process');
const { getFilesFromDirectory } = require('./common/utils');
const config = require('config');
const express = require('express');
const expressWebSocket = require('express-ws');
const { ensureDir, pathExists, remove } = require('fs-extra');
const md5 = require('md5-file/promise');
const { fs, crypto } = require('mz');
const { basename, join } = require('path');
const tar = require('tar-fs');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const WebSocket = require('ws');
const { parse } = require('url');
const { createGzip, createGunzip } = require('zlib');
const MachineState = require('./state');

async function setup() {
	let suite = null;
	const upload = {};
	const app = express();

	const state = new MachineState();

	expressWebSocket(app, null, {
		perMessageDeflate: false,
	});

	app.post('/upload', async (req, res) => {
		state.busy();
		res.writeHead(202, {
			'Content-Type': 'text/event-stream',
			Connection: 'keep-alive',
		});

		try {
			if (parseFloat(req.headers['x-token']) !== upload.token) {
				throw new Error('Unauthorized upload');
			}

			const artifact = {
				name: req.headers['x-artifact'],
				path: config.get('leviathan.uploads')[req.headers['x-artifact-id']],
				hash: req.headers['x-artifact-hash'],
			};
			const ignore = ['node_modules', 'package-lock.json'];

			let hash = null;
			if (await pathExists(artifact.path)) {
				const stat = await fs.stat(artifact.path);

				if (stat.isFile()) {
					hash = await md5(artifact.path);
				}
				if (stat.isDirectory()) {
					const struct = await getFilesFromDirectory(artifact.path, ignore);

					const expand = await Promise.all(
						struct.map(async entry => {
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
					hash = crypto
						.Hash('md5')
						.update(
							expand.reduce((acc, value) => {
								return acc + value.md5;
							}, ''),
						)
						.digest('hex');
				}
			}

			if (hash === artifact.hash) {
				res.write('upload: cache');
			} else {
				res.write('upload: start');
				// Make sure we start clean
				await remove(artifact.path);
				const line = pipeline(
					req,
					createGunzip(),
					tar.extract(config.get('leviathan.workdir')),
				);
				req.on('close', () => {
					line.cancel();
				});
				await line;
				res.write('upload: done');
			}
		} catch (e) {
			res.write(`error: ${e.message}`);
		} finally {
			delete upload.token;
			res.end();
		}
	});

	app.ws('/start', async (ws, req) => {
		state.busy();

		const reconnect = parse(req.originalUrl).query === 'reconnect'; // eslint-disable-line
		const running = suite != null;

		// Keep the socket alive
		const interval = setInterval(function timeout() {
			if (ws.readyState === WebSocket.OPEN) {
				ws.ping('heartbeat');
			}
		}, 1000);

		// Handler definitions
		const stdHandler = data => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(
					JSON.stringify({
						type: 'log',
						data: data.toString('utf-8').trimEnd(),
					}),
				);
			}
		};
		const msgHandler = message => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify(message));
			}
		};

		let suiteStarted = false;
		try {
			ws.on('error', console.error);
			ws.on('close', () => {
				clearInterval(interval);
			});

			if (running && !reconnect) {
				throw new Error(
					'Already runing a suite. Please stop it or try again later.',
				);
			}

			if (!running || !reconnect) {
				for (const uploadName in config.get('leviathan.uploads')) {
					upload.token = Math.random();
					ws.send(
						JSON.stringify({
							type: 'upload',
							data: {
								id: uploadName,
								name: basename(config.get('leviathan.uploads')[uploadName]),
								token: upload.token,
							},
						}),
					);

					// Wait for the upload to be received and finished
					await new Promise((resolve, reject) => {
						const timeout = setTimeout(() => {
							clearInterval(interval);
							clearTimeout(timeout);
							reject(new Error('Upload timed out'));
						}, 300000);
						const interval = setInterval(() => {
							if (upload.token == null) {
								clearInterval(interval);
								clearTimeout(timeout);
								resolve();
							}
						}, 2000);
						ws.once('close', () => {
							clearInterval(interval);
							clearTimeout(timeout);
						});
					});
				}

				// The reason we need to fork is because many 3rd party libariers output to stdout
				// so we need to capture that
				suite = fork('./lib/common/suite', {
					stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
				});
				suiteStarted = true;
			}

			ws.on('message', message => {
				try {
					const { type, data } = JSON.parse(message);

					if (type === 'input') {
						suite.stdin.write(Buffer.from(data));
					}
				} catch (e) {
					console.error(e);
				}
			});

			suite.stdout.on('data', stdHandler);
			suite.stderr.on('data', stdHandler);
			suite.on('message', msgHandler);

			if (reconnect) {
				suite.send({ action: 'reconnect' });
			}

			const suiteExitCode = await new Promise((resolve, reject) => {
				ws.on('close', () => {
					// Make sure we get the handlers off to prevent a memory leak from happening
					if (suite != null) {
						suite.stdout.off('data', stdHandler);
						suite.stderr.off('data', stdHandler);
						suite.off('message', msgHandler);
					}
					resolve();
				});
				suite.on('error', reject);
				suite.on('exit', resolve);
			});

			const success = suiteExitCode === 0;
			ws.send(
				JSON.stringify({
					type: 'status',
					data: { success },
				}),
			);

			if (success) {
				state.success();
			} else {
				state.failed();
			}
		} catch (e) {
			state.failed();
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: 'error', data: { message: e.stack } }));
			}
		} finally {
			ws.close();
			if (suiteStarted) {
				suite = null;
			}
		}
	});

	app.get('/artifacts', async (_req, res) => {
		try {
			await ensureDir(config.get('leviathan.artifacts'));
			tar
				.pack(config.get('leviathan.artifacts'), {
					readable: true,
					writable: true,
				})
				.pipe(createGzip())
				.pipe(res);
		} catch (e) {
			res.status(500).send(e.stack);
		}
	});

	app.post('/stop', async (_req, res) => {
		try {
			if (suite != null) {
				suite.on('exit', () => {
					res.send('OK');
				});
				suite.kill('SIGINT');
				suite = null;
			} else {
				res.send('OK');
			}
		} catch (e) {
			res.status(500).send(e.stack);
		}
	});

	return app;
}

(async function main() {
	const port = config.get('express.port');

	const server = await setup();

	server.listen(port, () => {
		console.log(`Listening on port ${port}`);
	});
})();
