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
  title: 'TC11 - Provisioning a device with deltas already enabled',
  interactive: true,
  run: async function(context) {
    this.resolveMatch(
      context.utils.runManualTestCase({
        do: [
          'Provision a device on the same app used for TC10 (that already has the RESIN_SUPERVISOR_DELTA=1 var and a pushed image)',
          'Push an update to the application (for example, change what is outputted to the console).'
        ],
        assert: [
          // eslint-disable-next-line no-multi-str
          'The device should appear on the dashboard and correctly download the image for the app. \
          The application should run as expected. \
          Opening an app container web terminal should allow execution of commands.',

          // eslint-disable-next-line no-multi-str
          'The dashboard logs should display: "Downloading delta for image ..." \
           The application update should be downloaded and then the updated app should be started. \
           Opening an app container web terminal should allow execution of commands.'
        ]
      }),
      true
    );
  }
};
