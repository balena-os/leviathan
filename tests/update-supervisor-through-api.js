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
  title: 'Update supervisor through the API',
  interactive: true,
  run: async (test, context, options) => {
    test.resolveMatch(utils.runManualTestCase({
      prepare: [
        'Ensure the device is online and running an application',
        `Logging into the device. Use the Web HostOS terminal from dashboard: ${context.dashboardUrl}`
      ],
      do: [
        'Copy paste the script from https://gist.github.com/horia-delicoti/848368a7e746e864c05e2a79f540dc3b inside ' +
        'your terminal and run it.'
      ],
      assert: [
        'Setting the supervisor should output the supervisor release ID and an OK for the set: ' +
        '"Extracted supervisor ID: XXX"',
        'The "update-resin-supervisor" run should have "Supervisor configuration found from API"'
      ],
      cleanup: [ 'Close the Web HostOS Terminal' ]
    }), true)
  }
}
