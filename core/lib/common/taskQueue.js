/**
 * # TaskQueue
 *
 * A queue of tasks to be carried out at a certain part of the suite or test.
 *
 * # Teardown
 * A TaskQueue used to maintain a list of tasks to execute at the end of the
 * suite or test. These will execute regardless of passing or failing.
 *
 * ```js
 * this.suite.teardown.register(() => {
 *    this.log('Worker teardown');
 *    return this.context.get().worker.teardown();
 * });
 * ```
 *
 * If registered in the suite, this will be carried out upon the suite (the collection of tests
 * ending. You can also add individual teardowns within tests, that will execute when the individual
 * test has ended. In this example here, within the test, we create an applciation, and after the
 * test, we wish to remove that application:
 *
 * @example
 * ```js
 *  module.exports = {
 * 	 title: 'Example',
 * 		 tests: [
 * 			 {
 * 				 title: 'Move device to another application',
 * 				 run: async function(test) {
 * 					 // create an app
 * 					 await this.context.get().balena.sdk.models.application.create({
 * 						 name: APP,
 * 						 deviceType: DEVICE_TYPE,
 * 						 organization: ORG,
 * 					 });
 * 					 // Register a teardown that will remove the test when the test ends
 * 					 this.teardown.register(() => {
 * 						 return this.context.get().balena.sdk.models.application.remove(APP);
 * 					 });
 * 					 // THE REST OF THE TEST CODE
 * 				 }
 * 			 }
 * 		 ]
 *  }
 * ```
 *
 * @module TaskQueue
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

const isFunction = require('lodash/isFunction');
const noop = require('lodash/noop');
const Bluebird = require('bluebird');

/**
 * A queue of tasks to be carried out at a certain part of the suite or test.
 * @class TaskQueue
 */
class TaskQueue {
	constructor() {
		this.tasks = new Map();
	}

	async runAll(scheduler = setImmediate) {
		for (const bucket of Array.from(this.tasks.keys()).reverse()) {
			await this.run(bucket, scheduler);
		}
	}

	async run(bucket = 'global', scheduler = setImmediate) {
		const prev = Bluebird.setScheduler(scheduler);

		if (this.tasks.has(bucket)) {
			for (const task of this.tasks.get(bucket).reverse()) {
				await task().catch((error) => {
					console.log(error);
				});
			}

			this.tasks.delete(bucket);
		}

		Bluebird.setScheduler(prev);
	}

	register(fn, bucket = 'global') {
		if (!isFunction(fn)) {
			throw new Error(`Can only register functions, got ${typeof fn}`);
		}

		if (!this.tasks.has(bucket)) {
			this.tasks.set(bucket, [fn]);
		} else {
			this.tasks.get(bucket).push(fn);
		}
	}
}

/**
 * A TaskQueue used to maintain a list of tasks to execute at the end of the
 * suite or test. These will execute regardless of passing or failing.
 * @class Teardown
 * @extends TaskQueue
 */
class Teardown extends TaskQueue {
	constructor() {
		super();

		process.on('SIGINT', noop);
		process.on('SIGTERM', noop);
		process.once('SIGINT', async () => {
			await this.runAll(process.nextTick);
			process.exit();
		});
		process.once('SIGTERM', async () => {
			await this.runAll(process.nextTick);
			process.exit();
		});
	}
}

module.exports = {
	/**
	 * A queue of tasks to be carried out at a certain part of the suite or test.
	 */
	Setup: TaskQueue,

	/**
	 * A TaskQueue used to maintain a list of tasks to execute at the end of the
	 * suite or test. These will execute regardless of passing or failing.
	 */
	Teardown: Teardown,
};
