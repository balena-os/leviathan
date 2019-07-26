const Bluebird = require('bluebird');
const { copy, emptyDir } = require('fs-extra');
const { fs } = require('mz');
const { tmpdir, constants } = require('os');
const { join } = require('path');
const tar = require('tar-fs');
const rp = require('request-promise');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const websocket = require('websocket-stream');
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

(async () => {
  await emptyDir(yargs.workdir);

  // Handle Image seperatly as it requires extra compression
  if ((await fs.stat(yargs.image))['isFile']) {
    await pipeline(
      fs.createReadStream(yargs.image),
      zlib.createGzip({ level: 6 }),
      fs.createWriteStream(join(yargs.workdir, 'image')),
    );
  }

  const artifacts = [
    { path: yargs.suite, type: 'isDirectory', name: 'suite' },
    { path: yargs.config, type: 'isFile', name: 'config.json' },
  ];

  for (let artifact of artifacts) {
    if ((await fs.stat(artifact.path))[artifact.type]()) {
      await copy(artifact.path, join(yargs.workdir, artifact.name));
    } else {
      throw new Error(`${artifact.path} does not satisfy ${artifcat.type}`);
    }
  }
  await pipeline(
    tar.pack(yargs.workdir, {
      ignore: function(name) {
        return /.*node_modules.*/.test(name);
      },
      entries: artifacts
        .map(x => {
          return x.name;
        })
        .concat(['image']),
    }),
    zlib.createGzip({ level: 6 }),
    rp.post(`http://${yargs.url}/upload`),
  ).delay(100);

  const ws = websocket(`ws://${yargs.url}/start`);
  // Keep the websocket alive
  ws.socket.on('ping', () => {
    ws.socket.pong('heartbeat');
  });
  process.on('SIGINT', async () => {
    await rp.post(`http://${yargs.url}/stop`);
    process.exit(128 + constants.signals.SIGINT);
  });
  process.stdin.pipe(ws);
  ws.pipe(process.stdout);
})();
