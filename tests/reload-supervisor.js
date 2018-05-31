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
  title: 'Reload supervisor on a running device',
  interactive: true,
  run: async (test, context, options) => {
    return utils.runManualTestCase(test, {
      prepare: [
        'Ensure the device is online and running an application',
        'Logging into the device (ssh to the host OS)',
        'Check with "balena images" that the correct supervisor version is running on the device'
      ],
      do: [
        'Stop the supervisor by running "systemctl stop resin-supervisor" on the host OS',
        'Remove the supervisor container by running "balena rm resin_supervisor"',
        `Remove all supervisor images: "balena rmi -f $(balena images -q resin/${context.deviceType.arch}-supervisor)"`,
        'Push an update to the application (for example, change what is outputted to the console)',
        'Execute "update-resin-supervisor"'
      ],
      assert: [
        'Now check the dashboard to see if your app update is being downloaded.',
        'Because the supervisor is stopped, the application update should NOT download',
        'After supervisor update download finishes, check that the app update is functional as expected.',
        'Execute "balena images". It should list the same supervisor version the device started with',
        'Execute "balena ps". It should list resin_supervisor running'
      ],
      cleanup: [ 'Close the Web Service Terminal' ]
    })
  }
}
