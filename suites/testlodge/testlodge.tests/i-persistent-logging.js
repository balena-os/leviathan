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
  title: 'TC41 - Test Persistent Logging',
  interactive: true,
  run: async context => {
    this.resolveMatch(
      context.utils.runManualTestCase({
        prepare: [
          "In Device Configuration activate variable RESIN_SUPERVISOR_PERSISTENT_LOGGING and set it's state to Enabled.",
          'This will reboot the device'
        ],
        do: ['On your balena device:', '\treboot', '\tjournalctl --list-boots'],
        assert: ['The journaltctl should show two logged boot entries ']
      }),
      true
    );
  }
};
