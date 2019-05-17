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
const isString = require('lodash/isString');
const merge = require('lodash/merge');
const reduce = require('lodash/reduce');
const template = require('lodash/template');

const AJV = require('ajv');
const Bluebird = require('bluebird');
const fse = require('fs-extra');
const npm = require('npm');
const { tmpdir } = require('os');
const path = require('path');
const tap = require('tap');

const utils = require('./utils');
const Teardown = require('./teardown');
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
        tmpdir: options.BALENA_TESTS_TMPDIR || tmpdir(),
        interactiveTests: options.BALENA_TESTS_ENABLE_INTERACTIVE_TESTS,
        replOnFailure: options.BALENA_TESTS_REPL_ON_FAILURE
      },
      require(path.join(this.suitePath, 'conf'))(options)
    );

    // State
    this.teardown = new Teardown();
    this.ctx = {};
    this.ctxGlobal = {};
    this.ctxStack = [];
    this.rootTree = this.resolveTestTree(require(path.join(this.suitePath, 'suite')));

    // Print queue
    this.printRunQueueSummary();
  }

  set globalContext(object) {
    merge(this.ctxGlobal, object);
  }

  get globalContext() {
    return this.ctxGlobal;
  }

  set context(object) {
    merge(this.ctx, object);
  }

  get context() {
    return reduce(this.ctxStack.concat(this.ctx, this.globalContext), merge);
  }

  async run() {
    // Recursive DFS
    const treeExpander = async ([{ interactive, deviceType, title, run, tests }, testNode]) => {
      const ajv = new AJV();

      // Check our contracts
      if (
        (interactive != null && !this.options.interactiveTests) ||
        (deviceType != null && !ajv.compile(deviceType)(this.options.deviceType))
      ) {
        return;
      }

      await testNode.test(
        template(title)({
          options: this.context
        }),
        { buffered: false, bail: true },
        async test => {
          this.ctxStack.push(this.ctx);
          this.ctx = {};

          if (run != null) {
            await Reflect.apply(Bluebird.method(run), this, [test])
              .catch(async error => {
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
              })
              .finally(async () => {
                await this.teardown.run(test.name);
              });
          }

          if (tests == null) {
            return;
          }

          for (const node of tests) {
            treeExpander([node, test]);
          }

          this.ctxStack.pop();
        }
      );
    };

    await Bluebird.try(async () => {
      await this.installDependencies();
      await treeExpander([this.rootTree, tap]);
    }).finally(async () => {
      await this.removeDependencies();
      await this.teardown.runAll();
      tap.end();
    });
  }

  // DFS
  resolveTestTree(suite) {
    const queue = [];
    queue.push(suite);

    while (queue.length > 0) {
      const { tests } = queue.pop();

      if (tests != null) {
        tests.forEach((test, i) => {
          if (isString(test)) {
            try {
              test = tests[i] = require(path.join(this.suitePath, test));
            } catch (error) {
              if (error.code === 'MODULE_NOT_FOUND') {
                console.error('Could not resolve test path. Ignoring...');
              } else {
                throw error;
              }
            }
            queue.push(test);
          }
        });
      }
    }

    return suite;
  }

  // DFS with depth tracking
  printRunQueueSummary() {
    console.log('Run queue summary:');

    const treeExpander = ({ title, tests }, depth) => {
      console.log(`${'\t'.repeat(depth)} ${title}`);

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
