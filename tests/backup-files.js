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
  title: 'Checking that backup files are not found in the image',
  interactive: true,
  run: async (test, context, options) => {
    return utils.runManualTestCase(test, {
      prepare: [ 'Logging into the device (ssh to the host OS)' ],
      do: [ 'Check files: "/etc/shadow-", "/etc/passwd-", "/etc/group-", "/etc/gshadow-"' ],
      assert: [ 'The files should not be found on the image' ],
      cleanup: [ 'Close the Web HostOS Terminal' ]
    })
  }
}
