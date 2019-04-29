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
  title: 'TC10 - Adding deltas to a running supervisor',
  interactive: true,
  run: async function(context) {
    this.resolveMatch(
      context.utils.runManualTestCase({
        do: [
          'Use the board from TC09, without reprovisioning.',
          'Add a Fleet Configuration RESIN_SUPERVISOR_DELTA = 1 config var. (It is important that the value is 1).',
          'Push an update to the application (e.g. changing what is outputted to the console).'
        ],
        assert: [
          'When setting RESIN_SUPERVISOR_DELTA, the device should not restart the app.',
          'The device should download the update correctly after pushing and the updated application should start running successfully.',
          'The dashboard logs should display: "Downloading delta for image ..."',
          'Opening an app container web terminal should allow execution of commands.'
        ]
      }),
      true
    );
  }
};
