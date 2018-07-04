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
  title: 'Push a multi-container application',
  interactive: true,
  run: async (test, context, options) => {
    test.resolveMatch(utils.runManualTestCase({
      do: [
        'Ensure the device is running a multicontainer application. Clone this repo and change directory to it:',
        '"git clone https://github.com/resin-io-projects/multicontainer-getting-started && cd multicontainer-getting-started"',
        `Add resin remote url: "git remote add resin ${options.gitUrl}"`,
        'Push to application: "git push resin master"'
      ],
      assert: [
        'The application should be downloaded and running successfully on the board',
        'You should be able to see the 3 service-containers running in the dashboard',
        'You should be able to ssh using the web service terminal on each of the 3 service containers'
      ],
      cleanup: [ 'Close the 3 Web Service Terminal' ]
    }), true)
    test.end()
  }
}
