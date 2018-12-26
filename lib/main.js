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

'use strict'

const _ = require('lodash')
const AJV = require('ajv')
const Bluebird = require('bluebird')
const tap = require('tap')

const utils = require('./common/utils')
const Suite = require('./common/suite')

const main = async (suitePath) => {
  const options = await require('./scripts/options.js')(process.env)

  const suite = new Suite(suitePath)

  // Not used currently
  //  const results = {
  //    author: null,
  //    deviceType: options.deviceType,
  //    provisionTime: null,
  //    imageSize: null,
  //    balenaOSVersion: options.balenaOSVersion
  //  }

  await Bluebird.using(await suite.disposer(options), (context) => {
    const deviceTypeContract = require(`../contracts/contracts/hw.device-type/${options.deviceType}/contract.json`)

    _.each(suite.tests, (testCase) => {
      if (testCase.interactive && !options.interactiveTests) {
        return
      }

      if (testCase.deviceType) {
        const ajv = new AJV()
        if (!ajv.compile(testCase.deviceType)(deviceTypeContract)) {
          return
        }
      }

      tap.test(_.template(testCase.title)({
        options
      }), (test) => {
        console.log(`Starting Test: ${test.name}`)
        return Reflect.apply(testCase.run, test, [ context, options ])
          .catch(async (error) => {
            test.threw(error)

            if (options.replOnFailure) {
              await utils.repl({
                context,
                options
              }, {
                name: test.name
              })
            }
          })
      })
    })
  })

  tap.end()
  await tap.collect()
}

main('../suites/e2e')
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
