#!/usr/bin/env node

const { tmpdir } = require('os');
const { join } = require('path');
const { createWriteStream } = require('fs');
const { ensureDir } = require('fs-extra');
const Client = require('../lib');
const yargs = require('yargs')
  .usage('Usage: $0 [options]')
  .option('h', {
    alias: 'help',
    description: 'display help message',
  })
  .option('d', {
    alias: 'deviceType',
    description: 'name of the device type we are testing',
    required: true,
    type: 'string',
  })
  .option('s', {
    alias: 'suite',
    description: 'path to test suite',
    required: true,
    type: 'string',
  })
  .option('i', {
    alias: 'image',
    description: 'path to unconfigured OS image',
    required: true,
    type: 'string',
  })
  .option('c', {
    alias: 'config',
    description: 'path to configuration file',
    required: true,
    type: 'string',
  })
  .option('w', {
    alias: 'workdir',
    description: 'working directory',
    type: 'string',
    default: `${tmpdir()}/run`,
  })
  .option('u', {
    alias: 'uri',
    description: 'Leviathan worker uri',
    type: 'string',
    default: 'localhost',
  })
  .version()
  .help('help')
  .showHelpOnFail(false, 'Something went wrong! run with --help').argv;

(async () => {
  const client = new Client(yargs.uri);

  const workdir = join(yargs.workdir, client.uri.hostname);

  await ensureDir(workdir);

  client.pipe(process.stdout);
  client.pipe(createWriteStream(join(workdir, 'log')));

  await client.run(
    yargs.deviceType,
    yargs.suite,
    yargs.config,
    yargs.image,
    workdir,
  );
})();
