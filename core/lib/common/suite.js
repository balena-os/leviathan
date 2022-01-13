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

const assignIn = require('lodash/assignIn');
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
const { Setup, Teardown } = require('./taskQueue');
const Test = require('./test');

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

module.exports = class Suite {
	constructor(suitePath, deviceTypeSlug, extraSuiteConf={}) {
		this.path = suitePath;
		this.deviceTypeSlug = deviceTypeSlug;
		// This seems to be deprecated?
		this.interactive = false;
		this.rootPath = path.join(__dirname, '..');

		const suiteConf = require(path.join(this.path, 'conf'));
		this.options = assignIn(
			{
				tmpdir: tmpdir(),
			},
			suiteConf(extraSuiteConf),
		);

		cleanObject(this.options);

		// State
		this.context = new Context();
		this.setup = new Setup();
		this.teardown = new Teardown();
		this.state = new State();
		this.passing = null;
		this.testSummary = {
			suite: ``,
			stats: {
				tests: 0,
				passes: 0,
				fails: 0,
				ran: 0,
			},
			tests: {},
		};

		try {
			this.deviceType = require(
				`../../contracts/contracts/hw.device-type/${this.deviceTypeSlug}/contract.json`
			);
		} catch (e) {
			if (e.code === 'MODULE_NOT_FOUND') {
				throw new Error(`Invalid/Unsupported device type: ${this.deviceTypeSlug}`);
			} else {
				throw e;
			}
		}
	}

	async init() {
		await Bluebird.try(async () => {
			await exec('npm cache clear --silent --force');
			await this.installDependencies();
			await this.setup.runAll();
			this.rootTree = this.resolveTestTree(
				path.join(this.path, 'suite'),
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
			{ interactive, os, skip, deviceType, title, workerContract, run, tests },
			testNode,
		]) => {
			// Check our contracts
			if (
				skip ||
				(interactive && !this.interactive) ||
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
							this.testSummary.tests[title] = 'pass';
							this.testSummary.stats.passes++;
						} else {
							this.testSummary.tests[title] = 'fail';
							this.testSummary.stats.fails++;
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
							test = tests[i] = require(
								path.join(
									this.path,
									test,
								)
							);
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
			prefix: this.path,
			'package-lock': false,
		});
		await Bluebird.promisify(npm.install)(
			this.path,
		);
	}

	async removeDependencies() {
		this.state.log(`Removing npm dependencies for suite:`);
		await Bluebird.promisify(fse.remove)(
			path.join(this.path, 'node_modules'),
		);
	}
}
