/**
 * # Test suites lifecycle (with node-tap)
 *
 * Contains code to parse, prepare, execute, monitor and teardown test suites and their tests that
 * are queued up for testing as per the configuration.
 *
 * @module Suite
 */

/*
 * Copyright 2018 balena
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

const config = require('config');
const isEmpty = require('lodash/isEmpty');
const isObject = require('lodash/isObject');
const isString = require('lodash/isString');
const template = require('lodash/template');
const fs = require('fs-extra');

const AJV = require('ajv');
const ajv = new AJV();
// AJV plugins
require('ajv-semver')(ajv);

const Bluebird = require('bluebird');

const fse = require('fs-extra');
const npm = require('npm');
const { tmpdir } = require('os');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const path = require('path');

const Context = require('./context');
const State = require('./state');
const { Teardown } = require('./taskQueue');
const Test = require('./test');

// Device identification
function uid(a) {
	return a
		? (a ^ (Math.random() * 16)).toString(16)
		: ([1e15] + 1e15).replace(/[01]/g, uid);
}

// Test identification
const id = `${Math.random()
	.toString(36)
	.substring(2, 10)}`;

function cleanObject(object) {
	if (!isObject(object)) {
		return;
	}

	for (const key in object) {
		cleanObject(object[key]);

		if (
			object[key] == null ||
			(isObject(object[key]) && isEmpty(object[key]))
		) {
			delete object[key];
		}
	}
}

class Suite {
	constructor() {
		const conf = require(config.get('leviathan.uploads.config'));
		this.rootPath = path.join(__dirname, '..');
		const options = {
			id,
			packdir: config.get('leviathan.workdir'),
			tmpdir: conf.tmpdir || tmpdir(),
			replOnFailure: conf.repl,
			balena: {
				application: {
					env: {
						delta: conf.supervisorDelta || false,
					},
				},
				apiKey: conf.balenaApiKey,
				apiUrl: conf.balenaApiUrl,
				organization: conf.organization
			},
			balenaOS: {
				config: {
					uuid: uid(),
				},
				download: {
					version: conf.downloadVersion,
				},
				network: {
					wired: conf.networkWired,
					wireless: conf.networkWireless,
				}
			}
		}

		// Setting the correct API environment for CLI calls
		exec(`echo "balenaUrl: '${conf.balenaApiUrl}'" > ~/.balenarc.yml`);

		// In the future, deprecate the options object completely to create a mega-conf
		// Breaking changes will need to be done to both test suites + helpers
		this.options = {
			...options,
			...conf
		}
		cleanObject(this.options);

		// State
		this.context = new Context();
		this.teardown = new Teardown();
		this.state = new State();
		this.passing = null;

		// Test summary
		this.testSummary = {
			suite: ``,
			stats: {
				tests: 0,
				ran: 0,
				skipped: () => this.testSummary.stats.tests - this.testSummary.stats.ran,
				passed: 0,
				failed: 0,
			},
			tests: {},
		};

		try {
			this.deviceType = require(`../../contracts/contracts/hw.device-type/${conf.deviceType}/contract.json`);
		} catch (e) {
			if (e.code === 'MODULE_NOT_FOUND') {
				throw new Error(`Invalid/Unsupported device type: ${conf.deviceType}`);
			} else {
				throw e;
			}
		}
	}

	async init() {
		await Bluebird.try(async () => {
			await exec('npm cache clear --silent --force');
			await this.installDependencies();
			await fs.ensureDir(config.get('leviathan.downloads'));
			if (fs.existsSync(config.get('leviathan.artifacts'))) {
				this.state.log(`Removing artifacts from previous tests...`);
				fs.emptyDirSync(config.get('leviathan.artifacts'));
			}
			this.rootTree = this.resolveTestTree(
				path.join(config.get('leviathan.uploads.suite'), 'suite'),
			);
			this.testSummary.suite = this.rootTree.title;
		}).catch(async (error) => {
			await this.removeDependencies();
			await this.removeDownloads();
			throw error;
		});
	}

	async run() {
		delete require.cache[require.resolve('tap')];
		const tap = require('tap');

		// Recursive DFS
		const treeExpander = async ([
			{ os, skip, deviceType, title, workerContract, run, tests },
			testNode,
		]) => {
			// Check our contracts
			if (
				skip ||
				(deviceType != null && !ajv.compile(deviceType)(this.deviceType)) ||
				(os != null &&
					this.context.get().os != null &&
					!ajv.compile(os)(this.context.get().os.contract)) ||
				(workerContract != null &&
					this.context.get().workerContract != null &&
					!ajv.compile(workerContract)(this.context.get().workerContract))
			) {
				return;
			}

			const test = new Test(title, this);

			await testNode.test(
				template(title)({
					options: this.context.get(),
				}),
				{
					buffered: false,
					bail: true,
				},
				async (t) => {
					if (run != null) {
						try {
							await Reflect.apply(Bluebird.method(run), test, [t]);
						} catch (error) {
							t.threw(error);
						} finally {
							await test.finish();
						}
					}

					if (tests == null) {
						this.testSummary.stats.ran++;
						let result = testNode.passing();
						if (result) {
							this.testSummary.tests[title] = 'passed';
							this.testSummary.stats.passed++;
						} else {
							this.testSummary.tests[title] = 'failed';
							this.testSummary.stats.failed++;
						}
						return;
					}
					for (const node of tests) {
						await treeExpander([node, t]);
					}
				},
			);
		};

		try {
			await treeExpander([this.rootTree, tap]);
		} finally {
			// Teardown all running test suites before removing assets & dependencies
			this.state.log(`Test suite completed. Tearing down now.`);
			await this.teardown.runAll();
			await this.createJsonSummary();
			await this.removeDependencies();
			// This env variable can be used to keep a configured, unpacked image for use when developing tests
			if (process.env.DEBUG_KEEP_IMG !== true) {
				await this.removeDownloads();
			}
			this.state.log(`Teardown complete.`);
			this.passing = tap.passing();
			tap.end();
			this.state.log(`Test Finished`);
		}
	}

	// DFS
	resolveTestTree(suite) {
		const root = require(suite);

		const queue = [];
		queue.push(root);

		while (queue.length > 0) {
			const { tests } = queue.pop();

			if (tests != null) {
				tests.forEach((test, i) => {
					if (isString(test)) {
						try {
							test = tests[i] = require(path.join(
								config.get('leviathan.uploads.suite'),
								test,
							));
						} catch (error) {
							this.state.log(error.message);
							if (error.code === 'MODULE_NOT_FOUND') {
								this.state.log('Could not resolve test path. Ignoring...');
							} else {
								throw error;
							}
						}
						queue.push(test);
					}
				});
			}
		}

		return root;
	}

	// DFS with depth tracking
	printRunQueueSummary() {
		this.state.log('Run queue summary:');
		const treeExpander = ({ title, tests }, depth) => {
			this.state.log(`${'\t'.repeat(depth)} ${title}`);
			if (tests == null) {
				this.testSummary.stats.tests++;
				this.testSummary.tests[title] = 'skipped';
				return;
			}

			for (const test of tests) {
				treeExpander(test, depth + 1);
			}
		};

		treeExpander(this.rootTree, 0);
	}

	async installDependencies() {
		this.state.log(`Install npm dependencies for suite: `);
		await Bluebird.promisify(npm.load)({
			loglevel: 'silent',
			progress: false,
			prefix: config.get('leviathan.uploads.suite'),
			'package-lock': false,
		});
		await Bluebird.promisify(npm.install)(
			config.get('leviathan.uploads.suite'),
		);
	}

	async createJsonSummary() {
		this.testSummary.stats.skipped = this.testSummary.stats.skipped()
		this.testSummary.dateTime = `${new Date().toString()}`
		let data = JSON.stringify(this.testSummary, null, 4);
		await fs.writeFileSync(`/reports/test-summary.json`, data);
	}

	async removeDependencies() {
		this.state.log(`Removing npm dependencies for suite:`);
		await Bluebird.promisify(fse.remove)(
			path.join(config.get('leviathan.uploads.suite'), 'node_modules'),
		);
	}

	async removeDownloads() {
		if (fs.existsSync(config.get('leviathan.downloads'))) {
			this.state.log(`Removing downloads directory...`);
			fs.emptyDirSync(config.get('leviathan.downloads'));
		}
	}
}

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
