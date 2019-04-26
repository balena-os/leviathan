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
  title: 'TC43 - Pinning device',
  interactive: true,
  run: async function(context) {
    this.resolveMatch(
      context.utils.runManualTestCase({
        prepare: ['Download the prod OS variant'],
        do: [
          'On your development machine:',
          '\tgit clone https://github.com/balena-io/wifi-connect',
          '\tgit remote add balena <your_app_repo>',
          '\tgit push balena master',
          '\tgit commit -m "empty" --allow-empty ',
          '\tgit push balena master',
          '\tbalena preload <the_image_you_downloaded> --app <app_id> --commit <the first commit, not the empty one> --pin-device-to-release'
        ],
        assert: [
          'When the board is started, check (with your phone for example) that the WiFi connect SSID is visible. This means the WiFi connect preloaded app is running as expected.',
          'When the device gets online in the dahsboard, check that it will be pinned to the desired release (it should not download the release containing the empty commit you did in the previous step).'
        ]
      }),
      true
    );
  }
};
