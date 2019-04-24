/*
 * Copyright 2019 balena
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

module.exports = {
  title: 'TC42 - Local Mode',
  interactive: true,
  run: async function(context) {
    this.resolveMatch(
      context.utils.runManualTestCase({
        prepare: [
          'Download the dev variant of the OS and provision the device with it',
          'Set device configuration variable: RESIN_SUPERVISOR_LOCAL_MODE=1',
          '\tgit clone https://github.com/resin-io-projects/simple-server-node'
        ],
        do: ['On your development machine:', '\tbalena push <deviceIp>'],
        assert: [
          'After the balena push command is executed, you should see logs from the application coming in the balena cli session.'
        ]
      }),
      true
    );
  }
};
