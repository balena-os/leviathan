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
	.option('c', {
		alias: 'suiteConfig',
		description: 'Config for the suite as a JSON string',
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
	const client = new Client(yargs.uri, yargs.workdir);

	await ensureDir(client.workdir);
	client.pipe(createWriteStream(join(client.workdir, 'log')));

	await client.run(JSON.parse(yargs.suiteConfig));
})();
