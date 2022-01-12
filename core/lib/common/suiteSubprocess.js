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

(async () => {
	const suite = new Suite();

	process.on('SIGINT', async () => {
		suite.state.log(`Suite recieved SIGINT`);
		await suite.teardown.runAll();
		await suite.createJsonSummary();
		await suite.removeDependencies();
		await suite.removeDownloads();
		process.exit(128);
	});

	const messageHandler = (message) => {
		const { action } = message;

		if (action === 'reconnect') {
			for (const action of ['info', 'log', 'status']) {
				suite.state[action]();
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

