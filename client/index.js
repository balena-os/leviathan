const Bluebird = require('bluebird');
const { emptyDir } = require('fs-extra');
const md5 = require('md5-file/promise');
const { fs, crypto } = require('mz');
const { tmpdir, constants } = require('os');
const { basename, dirname, join } = require('path');
const progStream = require('progress-stream');
const tar = require('tar-fs');
const rp = require('request-promise');
const { SpinnerPromise, Spinner, Progress } = require('./lib/visuals');
const pipeline = Bluebird.promisify(require('readable-stream').pipeline);
const WebSocket = require('ws');
const zlib = require('zlib');

const yargs = require('yargs')
  .usage('Usage: $0 [options]')
  .option('h', {
    alias: 'help',
    description: 'display help message',
  })
  .option('s', {
    alias: 'suite',
    description: 'path to test suite',
    type: 'string',
  })
  .option('i', {
    alias: 'image',
    description: 'path to unconfigured OS image',
    type: 'string',
  })
  .option('c', {
    alias: 'config',
    description: 'path to configuration file',
    type: 'string',
  })
  .option('w', {
    alias: 'workdir',
    description: 'working directory',
    type: 'string',
    default: `${tmpdir()}/run`,
  })
  .option('u', {
    alias: 'url',
    description: 'Leviathan url',
    type: 'string',
    default: 'localhost',
  })
  .version()
  .help('help')
  .showHelpOnFail(false, 'Something went wrong! run with --help').argv;

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

async function main() {
  await emptyDir(yargs.workdir);

  await new SpinnerPromise({
    promise: rp.get({
      uri: `http://${yargs.url}/aquire`,
    }),
    startMessage: 'Waiting in queue',
    stopMessage: 'Ready to go!',
  });

  const ignore = ['node_modules', 'package-lock.json'];
  const artifacts = [
    { path: yargs.suite, type: 'isDirectory', name: 'suite' },
    { path: yargs.config, type: 'isFile', name: 'config.json' },
    { path: yargs.image, type: 'isFile', name: 'image' },
  ];

  for (let artifact of artifacts) {
    const stat = await fs.stat(artifact.path);

    if (!stat[artifact.type]()) {
      throw new Error(`${artifact.path} does not satisfy ${artifact.type}`);
    }

    if (artifact.name === 'image') {
      const bar = new Progress('Gzipping Image');
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
        const gzippedPath = join(yargs.workdir, artifact.name);

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

  // Upload with cache check in place
  for (const artifact of artifacts) {
    console.log(`Handling artifcat: ${artifact.path}`);
    const spinner = new Spinner('Calculating hash');
    let hash = null;

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
      hash = crypto
        .Hash('md5')
        .update(
          expand.reduce((acc, value) => {
            return acc + value.md5;
          }, ''),
        )
        .digest('hex');
    }
    if (artifact.type === 'isFile') {
      hash = await md5(artifact.path);
    }
    spinner.stop();

    await new Promise(async (resolve, reject) => {
      const stat = await fs.stat(artifact.path);
      const bar = new Progress('Uploading');
      const str = progStream({
        length: stat.size,
        time: 100,
      });
      const req = rp.post({
        uri: `http://${yargs.url}/upload`,
        headers: {
          'x-artifact': artifact.name,
          'x-artifact-hash': hash,
        },
      });

      // We need to record the end of our pipe, so we can unpipe in case cache will be used
      const pipeEnd = zlib.createGzip({ level: 6 });
      const line = pipeline(
        tar.pack(dirname(artifact.path), {
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
        }),
        str,
        pipeEnd,
      ).delay(1000);
      pipeEnd.pipe(req);

      req.finally(() => {
        resolve();
      });
      req.on('error', reject);
      req.on('data', async data => {
        const computedLine = RegExp('^([a-z]*): (.*)').exec(data.toString());

        if (computedLine != null && computedLine[1] === 'error') {
          req.cancel();
          reject(new Error(computedLine[2]));
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
              console.log('[Cache used]');
              resolve();
              break;
            case 'done':
              // For uploads that are to fast we will to not even catch the end, so let's display it now
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

  const ws = new WebSocket(`ws://${yargs.url}/start`, [
    process.env.CI != null ? 'CI' : '',
  ]);
  // Keep the websocket alive
  ws.on('ping', () => {
    ws.pong('heartbeat');
  });
  process.once('SIGINT', async () => {
    await rp.post(`http://${yargs.url}/stop`);
    process.exit(128 + constants.signals.SIGINT);
  });
  process.once('SIGTERM', async () => {
    await rp.post(`http://${yargs.url}/stop`);
    process.exit(128 + constants.signals.SIGTERM);
  });
  process.stdin.on('data', data => {
    ws.send(data);
  });
  ws.on('message', pkg => {
    try {
      const message = JSON.parse(pkg);

      switch (message.status) {
        case 'running':
          process.stdout.write(Buffer.from(message.data.stdout));
          break;
        case 'exit':
          process.exitCode = message.data.code;
          break;
        default:
          break;
      }
    } catch (e) {
      console.error(`Parsing error: ${e}`);
      process.exitCode(1);
    }
  });
}

main().catch(async error => {
  await rp.post(`http://${yargs.url}/stop`).catch(console.error);
  console.error(error);
  process.exit(1);
});
