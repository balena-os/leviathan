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

const utils = require('../lib/utils')

module.exports = {
  title: 'Sync application container',
  interactive: true,
  run: async (test, context, options) => {
    test.resolveMatch(utils.runManualTestCase({
      prepare: [
        'Clone repo and change directory to it: "git clone https://github.com/balena-io-projects/simple-server-node && cd simple-server-node"',
        `Add balena remote url: "git remote add balena ${options.gitUrl}"`,
        'Push to application: "git push balena master"',
        'Enable Public Device URL'
      ],
      do: [
        'Ensure the device is running an application',
        'Confirm that the web server shows a "Hello World" message',
        'Edit server.js on the cloned application so that "res.send()" returns a different message',
        `Run "balena sync ${context.uuid} -s . -d /usr/src/app"`
      ],
      assert: [
        'The sync process should start with a status message appearing on each step',
        'A "balena sync completed successfully!" message should appear at the end',
        'The device\'s Public Device URL should now show the new response message'
      ],
      cleanup: [
        'Disable Public Device URL',
        'Restart application from the dashboard'
      ]
    }), true)
  }
}
