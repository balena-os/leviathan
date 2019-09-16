#!/usr/bin/env node

const { tmpdir } = require('os');
const yargs = require('yargs')
  .usage('Usage: $0 [options]')
  .option('h', {
    alias: 'help',
    description: 'display help message',
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

require('../lib')(
  yargs.suite,
  yargs.config,
  yargs.image,
  yargs.uri,
  yargs.workdir,
);
