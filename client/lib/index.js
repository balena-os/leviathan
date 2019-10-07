const Bluebird = require('bluebird');
const { exists } = require('fs-extra');
const md5 = require('md5-file/promise');
const { fs, crypto } = require('mz');
const { constants } = require('os');
const { basename, dirname, join } = require('path');
const progStream = require('progress-stream');
const rp = require('request-promise');
const pipeline = Bluebird.promisify(require('readable-stream').pipeline);
const tar = require('tar-fs');
const tarStream = require('tar-stream');
const { PassThrough } = require('stream');
const { parse } = require('url');
const { SpinnerPromise, Spinner, Progress } = require('./visuals');
const WebSocket = require('ws');
const zlib = require('zlib');

async function isGzip(filePath) {
  const buf = Buffer.alloc(3);

  await fs.read(await fs.open(filePath, 'r'), buf, 0, 3, 0);

  return buf[0] === 0x1f && buf[1] === 0x8b && buf[2] === 0x08;
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

module.exports = class Client extends PassThrough {
  constructor(uri) {
    super();

    this.uri = parse(uri);
    if (this.uri.protocol == null) {
      this.uri = parse(`http://${uri}`);
    }
  }

  run() {
    const main = async (deviceType, suite, config, image, workdir) => {
      process.on('SIGINT', async () => {
        await rp.post(`${this.uri.href}stop`).catch(this.write);
        process.exit(128 + constants.signals.SIGINT);
      });
      process.on('SIGTERM', async () => {
        await rp.post(`${this.uri.href}stop`).catch(this.write);
        process.exit(128 + constants.signals.SIGTERM);
      });

      await new SpinnerPromise(
        {
          promise: rp.get({
            uri: `${this.uri.href}aquire`,
          }),
          startMessage: 'Waiting in queue',
          stopMessage: 'Ready to go!',
        },
        this,
      );

      const ignore = ['node_modules', 'package-lock.json'];
      const artifacts = [
        { path: suite, type: 'isDirectory', name: 'suite' },
        { path: image, type: 'isFile', name: 'image' },
      ];

      let data = null;
      if (await exists(config)) {
        data = require(config);
      } else {
        data = JSON.parse(config);
      }
      data.deviceType = deviceType;
      artifacts.push({
        data,
        type: 'isJSON',
        name: 'config.json',
      });

      // Sanity checks + sanity checks
      for (let artifact of artifacts) {
        if (artifact.path != null) {
          const stat = await fs.stat(artifact.path);

          if (!stat[artifact.type]()) {
            throw new Error(
              `${artifact.path} does not satisfy ${artifact.type}`,
            );
          }

          if (artifact.name === 'image') {
            const bar = new Progress('Gzipping Image', this);
            const str = progStream({
              length: stat.size,
              time: 100,
            });
            str.on('progress', progress => {
              bar.update({
                percentage: progress.percentage,
                eta: progress.eta,
              });
            });
            if (!(await isGzip(artifact.path))) {
              const gzippedPath = join(workdir, artifact.name);

              await pipeline(
                fs.createReadStream(artifact.path),
                str,
                zlib.createGzip({ level: 6 }),
                fs.createWriteStream(gzippedPath),
              );

              artifact.path = gzippedPath;
            }
          }
        }
      }

      // Upload with cache check in place
      for (const artifact of artifacts) {
        this.write(`Handling artifcat: ${artifact.name}`);
        const spinner = new Spinner('Calculating hash', process.stdout);

        const metadata = { size: null, hash: null, stream: null };
        spinner.start();
        if (artifact.type === 'isDirectory') {
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
          metadata.hash = crypto
            .Hash('md5')
            .update(
              expand.reduce((acc, value) => {
                return acc + value.md5;
              }, ''),
            )
            .digest('hex');
          metadata.size = await fs.stat(artifact.path);
        }
        if (artifact.type === 'isFile') {
          metadata.hash = await md5(artifact.path);
          metadata.size = await fs.stat(artifact.path);
        }
        if (artifact.type === 'isDirectory' || artifact.type === 'isFile') {
          metadata.stream = tar.pack(dirname(artifact.path), {
            ignore: function(name) {
              return ignore.some(value => {
                const re = new RegExp(`.*${value}.*`);
                return re.test(name);
              });
            },
            map: function(header) {
              header.name = header.name.replace(
                basename(artifact.path),
                artifact.name,
              );
              return header;
            },
            entries: [basename(artifact.path)],
          });
        }
        if (artifact.type === 'isJSON') {
          metadata.hash = crypto
            .Hash('md5')
            .update(`${artifact.data}\n`)
            .digest('hex');
          metadata.size = artifact.data.length;
          metadata.stream = tarStream.pack();
          metadata.stream.entry(
            { name: artifact.name },
            JSON.stringify(artifact.data),
          );
          metadata.stream.finalize();
        }
        spinner.stop();

        await new Promise(async (resolve, reject) => {
          const bar = new Progress('Uploading', this);
          const str = progStream({
            length: metadata.size,
            time: 100,
          });
          const req = rp.post({
            uri: `${this.uri.href}upload`,
            headers: {
              'x-artifact': artifact.name,
              'x-artifact-hash': metadata.hash,
            },
          });

          req.then(resolve).catch(reject);

          // We need to record the end of our pipe, so we can unpipe in case cache will be used
          const pipeEnd = zlib.createGzip({ level: 6 });
          const line = pipeline(metadata.stream, str, pipeEnd)
            .delay(1000)
            .catch(reject);
          pipeEnd.pipe(req);

          req.on('error', reject);
          req.on('data', async data => {
            const computedLine = RegExp('^([a-z]*): (.*)').exec(
              data.toString(),
            );

            if (computedLine != null && computedLine[1] === 'error') {
              reject(new Error(computedLine[2]));
              req.cancel();
            }
            if (computedLine != null && computedLine[1] === 'upload') {
              switch (computedLine[2]) {
                case 'start':
                  str.on('progress', progress => {
                    bar.update({
                      percentage: progress.percentage,
                      eta: progress.eta,
                    });
                  });
                  await line;
                  break;
                case 'cache':
                  pipeEnd.unpipe(req);
                  this.write('[Cache used]');
                  resolve();
                  break;
                case 'done':
                  // For uploads that are too fast we will not even catch the end, so let's display it now
                  bar.update({
                    percentage: 100,
                  });
                  pipeEnd.unpipe(req);
                  resolve();
                  break;
              }
            }
          });
        });
      }

      await new Promise((resolve, reject) => {
        process.exitCode = 1;
        const ws = new WebSocket(`ws://${this.uri.hostname}/start`, [
          process.env.CI === 'true' ? 'CI' : '',
        ]);
        // Keep the websocket alive
        ws.on('ping', () => {
          ws.pong('heartbeat');
        });

        process.stdin.on('data', data => {
          ws.send(data);
        });
        ws.on('error', reject);
        ws.on('message', pkg => {
          try {
            const message = JSON.parse(pkg);

            switch (message.status) {
              case 'running':
                this.write(Buffer.from(message.data.stdout));
                break;
              case 'exit':
                process.exitCode = message.data.code;
                break;
              default:
                break;
            }
          } catch (e) {
            process.exitCode(1);
            reject(`Parsing error: ${e}`);
          }
        });
        ws.on('close', () => {
          process.stdin.destroy();
          resolve();
        });
      });
    };

    return main(...arguments)
      .catch(async error => {
        process.exitCode = 1;
        this.write(error);
      })
      .finally(async () => {
        await rp.post(`${this.uri.href}stop`).catch(this.write);
      });
  }
};
