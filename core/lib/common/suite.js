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

const isEmpty = require('lodash/isEmpty');
const isObject = require('lodash/isObject');
const isString = require('lodash/isString');
const template = require('lodash/template');

const AJV = require('ajv');
const ajv = new AJV();
// AJV plugins
require('ajv-semver')(ajv);

const Bluebird = require('bluebird');

const fse = require('fs-extra');
const { tmpdir } = require('os');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const path = require('path');

const Context = require('./context');
const State = require('./state');
const { Setup, Teardown } = require('./taskQueue');
const Test = require('./test');

// Device identification
function uid(a) {
	/* tslint:disable:no-bitwise */
	return a
		? (a ^ (Math.random() * 16)).toString(16)
		: ([1e15] + 1e15).replace(/[01]/g, uid);
	/* tslint:enable:no-bitwise */
}

// Test identification
const id = `${Math.random().toString(36).substring(2, 10)}`;

function cleanObject(object) {
	if (!isObject(object)) {
		return;
	}

	for (const key of Object.keys(object)) {
		cleanObject(object[key]);

		if (
			object[key] == null ||
			(isObject(object[key]) && isEmpty(object[key]))
		) {
			delete object[key];
		}
	}
}

module.exports = class Suite {
	constructor(suiteOptions, suiteConfig) {
		this.suitePath = suiteOptions.suitePath;
		this.image = suiteOptions.imagePath;
		this.kernelHeaders = suiteOptions.kernelHeadersPath;
		this.deviceTypeSlug = suiteOptions.deviceType;
		this.workerAddress = suiteOptions.workerAddress;
		this.rootPath = path.join(__dirname, '..');
		const options = {
			id,
			tmpdir: suiteConfig.config.tmpdir || tmpdir(),
			replOnFailure: suiteConfig.config.repl,
			balena: {
				application: {
					env: {
						delta: suiteConfig.config.supervisorDelta || false,
					},
				},
				apiKey: suiteConfig.config.balenaApiKey,
				apiUrl: suiteConfig.config.balenaApiUrl,
				organization: suiteConfig.config.organization,
			},
			balenaOS: {
				config: {
					uuid: uid(),
					installerForceMigration: suiteConfig.config.installerForceMigration,
				},
				download: {
					version: suiteConfig.config.downloadVersion,
				},
				network: {
					wired: suiteConfig.config.networkWired,
					wireless: suiteConfig.config.networkWireless,
				},
			},
		};

		// Setting the correct API environment for CLI calls
		exec(
			`echo "balenaUrl: '${suiteConfig.config.balenaApiUrl}'" > ~/.balenarc.yml`,
		);

		// In the future, deprecate the options object completely to create a mega-suiteConfig
		// Breaking changes will need to be done to both test suites + helpers
		this.options = {
			...options,
			...suiteConfig,
		};
		cleanObject(this.options);

		// State
		this.context = new Context();
		this.setup = new Setup();
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
			get dateTime() {
				return new Date().toString();
			},
		};

		try {
			// Find device type contract in public contracts
			this.deviceType = require(`../../contracts/contracts/hw.device-type/${this.deviceTypeSlug}/contract.json`)
		} catch (e) {
			try {
				// Find device type contract in private contracts
				this.deviceType = require(`../../private-contracts/contracts/hw.device-type/${this.deviceTypeSlug}/contract.json`)
			} catch (error) {
				if (e.code === 'MODULE_NOT_FOUND') {
					if (error.code === 'MODULE_NOT_FOUND') {
						throw new Error(
							`Invalid/Unsupported device type: ${suiteConfig.deviceType}`,
						);
					}
				} else {
					throw new Error(`Contracts error: ${e} \nPrivate Contracts error: ${error}`);
				}
			}
		}
	}

	async init() {
		await Bluebird.try(async () => {
			await this.setup.runAll();
			await this.installDependencies();
			this.rootTree = this.resolveTestTree(
				path.join(this.suitePath, 'suite'),
			);
			this.testSummary.suite = this.rootTree.title;
		}).catch(async (error) => {
			await this.removeDependencies();
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
					bail: this.options.debug ? (this.options.debug.failFast === false ? this.options.debug.failFast : true) : true,
					todo: this.options.debug ? (
						this.options.debug.unstable ? (
							this.options.debug.unstable.includes(title) ? true : false)
							: false)
						: false
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
			await this.removeDependencies();
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
								this.suitePath,
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
		await exec('npm cache clear --silent --force');
		this.state.log(`Install npm dependencies for suite: `);
		await exec(`npm install --prefix ${this.suitePath} --prefer-offline --no-progress &> /dev/null`);
	}

	async removeDependencies() {
		this.state.log(`Removing npm dependencies for suite:`);
		await Bluebird.promisify(fse.remove)(
			path.join(this.suitePath, 'node_modules'),
		);
	}
}
