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

module.exports = class Teardown {
	constructor() {
		this.store = new Map();

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

	async runAll(scheduler = setImmediate) {
		for (const bucket of Array.from(this.store.keys()).reverse()) {
			await this.run(bucket, scheduler);
		}
	}

	async run(bucket = 'global', scheduler = setImmediate) {
		const prev = Bluebird.setScheduler(scheduler);

		if (this.store.has(bucket)) {
			for (const teardown of this.store.get(bucket).reverse()) {
				await teardown().catch(error => {
					console.log(error);
				});
			}

			this.store.delete(bucket);
		}

		Bluebird.setScheduler(prev);
	}

	register(fn, bucket = 'global') {
		if (!isFunction(fn)) {
			throw new Error(`Can only register functions, got ${typeof fn}`);
		}

		if (!this.store.has(bucket)) {
			this.store.set(bucket, [fn]);
		} else {
			this.store.get(bucket).push(fn);
		}
	}
};
