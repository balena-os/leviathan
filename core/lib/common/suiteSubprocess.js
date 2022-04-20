/**
 * # Test suite subprocess
 *
 * Contains code to setup and run a test suite in a subprocess with signal
 * handling and messaging between the child and parent processes
 *
 * @module SuiteSubprocess
 */

/*
 * Copyright 2022 balena
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

const Suite = require('./suite');
const config = require('config');
const fs = require('fs-extra');

async function removeArtifacts() {
	const artifactsPath = config.get('leviathan.artifacts');
	if (fs.existsSync(artifactsPath)) {
		this.state.log(`Removing artifacts from previous tests...`);
		fs.emptyDirSync(artifactsPath);
	}
}

async function removeDownloads() {
	const downloadsPath = config.get('leviathan.downloads');
	// This env variable can be used to keep a configured, unpacked image for use
	// when developing tests
	if (fs.existsSync(downloadsPath) && !process.env.DEBUG_KEEP_IMG) {
		console.log('Removing downloads directory...');
		fs.emptyDirSync(downloadsPath);
	}
}

async function createJsonSummary(suite) {
	let data = JSON.stringify(suite.testSummary, null, 4);
	return fs.writeFile(`/reports/test-summary.json`, data);
}

(async () => {
	const conf = require(config.get('leviathan.uploads.config'));
	const suite = new Suite(
		{
			suitePath: config.get('leviathan.uploads.suite'),
			deviceType: conf.deviceType,
			imagePath: config.get('leviathan.uploads').image,
		},
		conf
	);
	suite.setup.register(removeArtifacts);
	suite.setup.register(
		async () => fs.ensureDir(config.get('leviathan.downloads'))
	);

	suite.teardown.register(removeDownloads);
	suite.teardown.register(
		async () => createJsonSummary(suite)
	);

	process.on('SIGINT', async () => {
		suite.state.log(`Suite recieved SIGINT`);
		await suite.teardown.runAll();
		await createJsonSummary(suite);
		await suite.removeDependencies();
		await suite.removeDownloads();
		process.exit(128);
	});

	const messageHandler = (message) => {
		const { action } = message;

		if (action === 'reconnect') {
			for (const item of ['info', 'log', 'status']) {
				suite.state[item]();
			}
		}
	};
	process.on('message', messageHandler);

	await suite.init();
	suite.printRunQueueSummary();
	await suite.run();

	suite.state.log(`Suite run complete`);
	process.off('message', messageHandler);
	suite.state.log(`Exiting suite child process...`);
	if (suite.passing) {
		process.exit();
	} else {
		process.exit(1);
	}
})();

