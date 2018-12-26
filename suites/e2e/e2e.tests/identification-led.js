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

module.exports = {
  title: 'Identification LED',
  interactive: true,
  deviceType: {
    type: 'object',
    required: [ 'data' ],
    properties: {
      data: {
        type: 'object',
        required: [ 'led' ],
        properties: {
          led: {
            type: 'boolean',
            const: true
          }
        }
      }
    }
  },
  run: async function (context, options) {
    this.resolveMatch(context.utils.runManualTestCase({
      do: [ `Click the "Identify" button from the dashboard: ${context.dashboardUrl}` ],
      assert: [ 'The device\'s identification LEDs should blink for a couple of seconds' ]
    }), true)
  }
}
