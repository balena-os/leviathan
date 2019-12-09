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

const AJV = require('ajv');
const ajv = new AJV();
// AJV plugins
require('ajv-semver')(ajv);

const Bluebird = require('bluebird');

const fse = require('fs-extra');
const npm = require('npm');
const { tmpdir } = require('os');
const path = require('path');

const Context = require('./context');
const State = require('./state');
const Teardown = require('./teardown');
const Test = require('./test');
const utils = require('./utils');

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
		this.options = assignIn(
			{
				packdir: config.get('leviathan.workdir'),
				tmpdir: conf.tmpdir || tmpdir(),
				interactiveTests: conf.interactive,
				replOnFailure: conf.repl,
			},
			require(path.join(config.get('leviathan.uploads.suite'), 'conf'))(conf),
		);
		cleanObject(this.options);

		// State
		this.context = new Context();
		this.teardown = new Teardown();
		this.state = new State();

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
			await this.installDependencies();
			this.rootTree = this.resolveTestTree(
				path.join(config.get('leviathan.uploads.suite'), 'suite'),
			);
		}).catch(async error => {
			await this.removeDependencies();
			throw error;
		});
	}

	async run() {
		await new Bluebird(async (resolve, reject) => {
			delete require.cache[require.resolve('tap')];
			const tap = require('tap');

			// Recursive DFS
			const treeExpander = async ([
				{ interactive, os, skip, deviceType, title, run, tests },
				testNode,
			]) => {
				// Check our contracts
				if (
					skip ||
					(interactive && !this.options.interactiveTests) ||
					(deviceType != null && !ajv.compile(deviceType)(this.deviceType)) ||
					(os != null &&
						this.context.get().os != null &&
						!ajv.compile(os)(this.context.get().os.contract))
				) {
					return;
				}

				const test = new Test(title, this);

				await testNode
					.test(
						template(title)({
							options: this.context.get(),
						}),
						{ buffered: false },
						async t => {
							if (run != null) {
								await Reflect.apply(Bluebird.method(run), test, [t])
									.catch(async error => {
										t.threw(error);

										if (this.options.replOnFailure) {
											await utils.repl(
												{
													context: this.context.get(),
												},
												{
													name: t.name,
												},
											);
										}
									})
									.finally(async () => {
										await test.finish();
									});
							}

							if (tests == null) {
								return;
							}

							for (const node of tests) {
								treeExpander([node, t]);
							}
						},
					)
					.then(resolve)
					.catch(reject);
			};

			await Bluebird.try(async () => {
				await treeExpander([this.rootTree, tap]);
			})
				.finally(async () => {
					await this.removeDependencies();
					await this.teardown.runAll();
					tap.end();
				})
				.then(resolve)
				.then(reject);
		});
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

	async removeDependencies() {
		this.state.log(`Removing npm dependencies for suite:`);
		await Bluebird.promisify(fse.remove)(
			path.join(config.get('leviathan.uploads.suite'), 'node_modules'),
		);
	}
}

(async () => {
	const suite = new Suite();
	process.on('message', message => {
		const { action } = message;

		if (action === 'reconnect') {
			for (const action of ['info', 'log', 'status']) {
				suite.state[action]();
			}
		}
	});

	await suite.init();
	suite.printRunQueueSummary();
	await suite.run();
})();
