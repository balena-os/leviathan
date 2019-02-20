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
    this.registered = [];

    process.on('SIGINT', noop);
    process.once('SIGINT', async () => {
      await this.run(process.nextTick);
      process.exit();
    });
  }

  async run(scheduler) {
    const prev = Bluebird.setScheduler(scheduler);

    while (this.registered.length !== 0) {
      await this.registered.pop()();
    }

    Bluebird.setScheduler(prev);
  }

  register(fn) {
    if (!isFunction(fn)) {
      throw new Error(`Can only register functions, got ${typeof fn}`);
    }

    this.registered.push(fn);
  }
};
