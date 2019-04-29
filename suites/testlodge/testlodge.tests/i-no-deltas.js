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
  title: 'TC09 - Normal provisioning without deltas',
  interactive: true,
  run: async function(context) {
    this.resolveMatch(
      context.utils.runManualTestCase({
        do: [
          'Provision a board on a test application. Ensure RESIN_SUPERVISOR_DELTA config var is not set to "1".',
          'Push a simple application (e.g. a loop that prints to console).',
          'Once updated, test LED blink and app container Web Terminal.',
          'Set an environment variable FOO=bar.'
        ],
        assert: [
          'Device should appear on the dashboard.',
          'Device should download the application and run it.',
          'LED should blink. (if available)',
          'The app container Web Terminal should open and allow running commands.',
          'When the env var is set, the device should restart the application so that it can use the new var if needed.',
          'Opening an app container web terminal and running "env" should show the variable is correctly set.'
        ]
      }),
      true
    );
  }
};
