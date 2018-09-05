/*
 * Copyright 2017 resin.io
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

const utils = require('../lib/utils')

module.exports = {
  title: 'Enter running application container',
  interactive: true,
  run: async (test, context, options) => {
    test.resolveMatch(utils.runManualTestCase({
      prepare: [
        `Ensure the device is running an application: ${context.dashboardUrl}. Clone one of the repos and change directory:`,
        '"git clone https://github.com/resin-io-projects/resin-cpp-hello-world.git && cd resin-cpp-hello-world" or',
        '"git clone https://github.com/resin-io-projects/simple-server-node.git && cd simple-server-node"',
        `Add resin remote url: "git remote add resin ${options.gitUrl}"`,
        'Push to application: "git push resin master"'
      ],
      do: [ `Run "resin ssh ${context.uuid}"` ],
      assert: [
        'A shell prompt should appear after a few seconds',
        'Running "env | grep RESIN_DEVICE_NAME_AT_INIT" should return the device name listed in the dashboard'
      ],
      cleanup: [ 'Exit shell' ]
    }), true)
  }
}
