/*
 * Copyright 2017 balena
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

const forEach = require('lodash/forEach');
const template = require('lodash/template');

const Bluebird = require('bluebird');
const tap = require('tap');

const utils = require('./common/utils');
const Suite = require('./common/suite');

const main = async () => {
  // Not used currently
  //  const results = {
  //    author: null,
  //    deviceType: options.deviceType,
  //    provisionTime: null,
  //    imageSize: null,
  //    balenaOSVersion: options.balenaOSVersion
  //  }

  const suite = new Suite(process.env);

  await Bluebird.using(suite.disposer(tap), context => {
    forEach(suite.tests, testCase => {
      tap.test(
        template(testCase.title)({
          options: context
        }),
        test => {
          console.log(`Starting Test: ${test.name}`);
          return Reflect.apply(testCase.run, test, [context]).catch(async error => {
            test.threw(error);

            if (suite.options.replOnFailure) {
              await utils.repl(
                {
                  context
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
};

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
