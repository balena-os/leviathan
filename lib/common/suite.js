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

const flow = require('lodash/fp/flow');
const map = require('lodash/fp/map');
const filter = require('lodash/fp/filter');
const assignIn = require('lodash/assignIn');
const forEach = require('lodash/forEach');
const merge = require('lodash/merge');
const template = require('lodash/template');

const AJV = require('ajv');
const Bluebird = require('bluebird');
const fse = require('fs-extra');
const npm = require('npm');
const path = require('path');

const tap = require('tap');

const { printRunQueueSummary } = require('./utils');

const Teardown = require('./teardown');
const utils = require('./utils');

module.exports = class Suite {
  constructor(options) {
    this.frameworkPath = path.join(__dirname, '..');
    this.suiteName = options.BALENA_TESTS_SUITE_NAME;
    this.suitePath = path.join(
      __dirname,
      '..',
      '..',
      options.BALENA_TESTS_SUITES_PATH,
      this.suiteName
    );
    this.options = assignIn(
      {
        deviceType: options.BALENA_TESTS_DEVICE_TYPE,
        tmpdir: options.BALENA_TESTS_TMPDIR,
        interactiveTests: options.BALENA_TESTS_ENABLE_INTERACTIVE_TESTS,
        replOnFailure: options.BALENA_TESTS_REPL_ON_FAILURE
      },
      require(path.join(this.suitePath, `${this.suiteName}.conf`))(options)
    );
    this.teardown = new Teardown();
    this.ctx = {};
  }

  set context(object) {
    merge(this.ctx, object);
  }

  get context() {
    return this.ctx;
  }

  async run() {
    const suite = require(path.join(this.suitePath, `${this.suiteName}.suite`));

    await this.installDependencies();

    const objTests = map(({ setup, tests }) => {
      return {
        setup: setup.bind(this),
        tests: flow(
          map(test => {
            return require(path.join(this.suitePath, `${this.suiteName}.tests`, test));
          }),
          filter(test => {
            const ajv = new AJV();
            return !(
              (test.interactive && !this.options.interactiveTests) ||
              (test.deviceType && !ajv.compile(test.deviceType)(this.options.deviceType))
            );
          })
        )(tests)
      };
    }, suite);

    printRunQueueSummary(objTests);

    try {
      await Bluebird.each(objTests, async ({ setup, tests }) => {
        await setup.bind(this)();

        forEach(tests, testCase => {
          tap.test(
            template(testCase.title)({
              options: this.context
            }),
            { buffered: false },
            test => {
              return Reflect.apply(testCase.run, this, [test]).catch(async error => {
                test.threw(error);

                if (this.options.replOnFailure) {
                  await utils.repl(
                    {
                      context: this.context
                    },
                    {
                      name: test.name
                    }
                  );
                }
              });
            }
          );
        });
      });
    } finally {
      tap.end();
      await tap.collect();
      await this.removeDependencies();
      await this.teardown.run(setImmediate);
    }
  }

  subtest(parentTest, testCase) {
    parentTest.test(
      template(testCase.title)({
        options: this.context
      }),
      { buffered: false },
      test => {
        return Reflect.apply(testCase.run, this, [test]).catch(async error => {
          test.threw(error);

          if (this.options.replOnFailure) {
            await utils.repl(
              {
                context: this.context
              },
              {
                name: test.name
              }
            );
          }
        });
      }
    );
  }

  async installDependencies() {
    console.log(`Install npm dependencies for suite: ${this.suiteName}`);
    await Bluebird.promisify(npm.load)({
      loglevel: 'silent',
      progress: false,
      prefix: this.suitePath,
      'package-lock': false
    });
    await Bluebird.promisify(npm.install)(this.suitePath);
  }

  async removeDependencies() {
    console.log(`Removing npm dependencies for suite: ${this.suitePath}`);
    await Bluebird.promisify(fse.remove)(path.join(this.suitePath, 'node_modules'));
  }
};
