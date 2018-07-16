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
  title: 'Update device status with resin-device-progress',
  interactive: true,
  run: async (test, context, options) => {
    test.resolveMatch(utils.runManualTestCase({
      prepare: [ 'Logging into the device (ssh to the host OS)' ],
      do: [ 'Update device status by running: "resin-device-progress -p 60 -s "resinOS test" "' ],
      assert: [
        'The command runs successfully',
        'The device dashboard status is updated to show 60% and status message "resinOS test"'
      ],
      cleanup: [ 'Close the Web HostOS Terminal' ]
    }), true)
    test.end()
  }
}
