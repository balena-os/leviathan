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
const isEmpty = require('lodash/isEmpty');
const isObject = require('lodash/isObject');
const isString = require('lodash/isString');
const merge = require('lodash/merge');
const reduce = require('lodash/reduce');
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

const utils = require('./utils');
const Teardown = require('./teardown');

function cleanObject(object) {
  if (!isObject(object)) {
    return;
  }

  for (const key in object) {
    cleanObject(object[key]);

    if (object[key] == null || (isObject(object[key]) && isEmpty(object[key]))) {
      delete object[key];
    }
  }
}

module.exports = class Suite {
  constructor(packdir) {
    const config = require(`${packdir}/config.json`);

    this.frameworkPath = path.join(__dirname, '..');
    this.options = assignIn(
      {
        packdir,
        suitePath: path.join(packdir, 'suite'),
        tmpdir: config.BALENA_TESTS_TMPDIR || tmpdir(),
        interactiveTests: config.BALENA_TESTS_ENABLE_INTERACTIVE_TESTS,
        replOnFailure: config.BALENA_TESTS_REPL_ON_FAILURE
      },
      require(path.join(packdir, 'suite', 'conf'))(config)
    );
    cleanObject(this.options);

    // State
    this.teardown = new Teardown();
    this.ctx = {};
    this.ctxGlobal = {};
    this.ctxStack = [];
    this.deviceType = require(`../../contracts/contracts/hw.device-type/${
      config.BALENA_TESTS_DEVICE_TYPE
    }/contract.json`);
  }

  async init() {
    await Bluebird.try(async () => {
      await this.installDependencies();
      this.rootTree = this.resolveTestTree(path.join(this.options.suitePath, 'suite'));
    }).catch(async error => {
      await this.removeDependencies();
      throw error;
    });
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
    delete require.cache[require.resolve('tap')];
    const tap = require('tap');

    // Recursive DFS
    const treeExpander = async ([
      { interactive, os, skip, deviceType, title, run, tests },
      testNode
    ]) => {
      // Check our contracts
      if (
        skip ||
        (interactive && !this.options.interactiveTests) ||
        (deviceType != null && !ajv.compile(deviceType)(this.deviceType)) ||
        (os != null && this.context.os != null && !ajv.compile(os)(this.context.os.contract))
      ) {
        return;
      }

      await testNode.test(
        template(title)({
          options: this.context
        }),
        { buffered: false },
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
      await treeExpander([this.rootTree, tap]);
    }).finally(async () => {
      await this.removeDependencies();
      await this.teardown.runAll();
      tap.end();
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
              test = tests[i] = require(path.join(this.options.suitePath, test));
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

    return root;
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
    console.log(`Install npm dependencies for suite: `);
    await Bluebird.promisify(npm.load)({
      loglevel: 'silent',
      progress: false,
      prefix: this.options.suitePath,
      'package-lock': false
    });
    await Bluebird.promisify(npm.install)(this.options.suitePath);
  }

  async removeDependencies() {
    console.log(`Removing npm dependencies for suite: `);
    await Bluebird.promisify(fse.remove)(path.join(this.options.suitePath, 'node_modules'));
  }
};
