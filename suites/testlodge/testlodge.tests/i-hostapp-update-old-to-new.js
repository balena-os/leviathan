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
  title:
    'TC28 - Test old to new resin host OS update (old hostapps enabled OS updated to current hostapps enabled OS)',
  interactive: true,
  run: async function(context) {
    this.resolveMatch(
      context.utils.runManualTestCase({
        prepare: ['Provision a device with a previous balenaOS version.'],

        do: [
          'On the balena device:',
          '\thostapp-update -r -i <DOCKERHUB_ACCOUNT>/<DOCKERHUB_REPO>:<TAG>',
          'e.g.: resin/resinos-staging:2.7.2_rev2-intel-edison (note that “2.7.2+rev2” becomes “2.7.2_rev2” for the purpose of the tag.)'
        ],
        assert: [
          'On the balena device:',
          '\tcat /etc/os-release',
          'The above command should report the correct new version',
          '\tls -al /dev/disk/by-state/',
          'The above command should have moved the active partition to p3'
        ]
      }),
      true
    );
  }
};
