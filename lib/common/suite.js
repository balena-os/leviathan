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

const map = require('lodash/map');
const assignIn = require('lodash/assignIn');

const Bluebird = require('bluebird');
const fse = require('fs-extra');
const npm = require('npm');
const path = require('path');

module.exports = class Suite {
  constructor(options) {
    this.name = options.BALENA_TESTS_SUITE_NAME;
    this.root = path.join(__dirname, '..', '..', options.BALENA_TESTS_SUITES_PATH, this.name);
    this.options = assignIn(
      {
        deviceType: options.BALENA_TESTS_DEVICE_TYPE,
        tmpdir: options.BALENA_TESTS_TMPDIR,
        interactiveTests: options.BALENA_TESTS_ENABLE_INTERACTIVE_TESTS,
        replOnFailure: options.BALENA_TESTS_REPL_ON_FAILURE
      },
      require(path.join(this.root, `${this.name}.conf`))(options)
    );
  }

  async disposer(tap) {
    const { setup, tests } = require(path.join(this.root, `${this.name}.suite`));

    await this.installDependencies();

    this.tests = map(tests, test => {
      return require(path.join(this.root, `${this.name}.tests`, test));
    });

    return Bluebird.method(setup)(path.join(__dirname, '..', '..'), this.options).disposer(
      async context => {
        tap.end();
        await tap.collect();
        await this.removeDependencies();
        await context.teardown.run(setImmediate);
      }
    );
  }

  async installDependencies() {
    console.log(`Install npm dependencies for suite: ${this.name}`);
    await Bluebird.promisify(npm.load)({
      loglevel: 'silent',
      progress: false,
      prefix: this.root,
      'package-lock': false
    });
    await Bluebird.promisify(npm.install)(this.root);
  }

  async removeDependencies() {
    console.log(`Removing npm dependencies for suite: ${this.root}`);
    await Bluebird.promisify(fse.remove)(path.join(this.root, 'node_modules'));
  }
};
