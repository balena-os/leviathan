/*
 * Copyright 2018 balena
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
  title: 'Balena boot splash tests',
  interactive: true,
  deviceType: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['hdmi'],
        properties: {
          hdmi: {
            type: 'boolean',
            const: true,
          },
        },
      },
    },
  },
  tests: [
    {
      title: 'Reboot test',
      run: async function(test) {
        test.resolveMatch(
          this.context.utils.runManualTestCase({
            prepare: ["Plug a monitor in the device's HDMI output"],
            do: ['Reboot the device'],
            assert: [
              'The balena logo splash screen should be visible when the board initiates reboot',
            ],
          }),
          true,
        );
      },
    },
    {
      title: 'Shutdown test',
      run: async function(test) {
        test.resolveMatch(
          this.context.utils.runManualTestCase({
            prepare: ["Plug a monitor in the device's HDMI output"],
            do: ['Shutdown the device'],
            assert: [
              'The balena logo splash screen should be visible when the board initiates the shutdown',
              'The Tux (Linux) logo should not be visible on the screen while device is booting',
              'The balena logo splash screen should be visible during boot-up',
            ],
          }),
          true,
        );
      },
    },
  ],
};
