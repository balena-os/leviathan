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
  title: 'TC49 - Override lock',
  interactive: true,
  run: async function(context) {
    this.resolveMatch(
      context.utils.runManualTestCase({
        do: [
          'On your development machine',
          '\tgit clone https://github.com/balena-io-playground/balena-updates-lock',
          '\tcd balena-updates-lock',
          "\tgit remote add balena YYY (copy the link from the application's dashboard)",
          '\tgit push balena',
          '\tgit clone https://github.com/resin-io-projects/simple-server-python',
          '\tcd simple-server-python',
          "\tgit remote add balena YYY (copy the link from the application's dashboard)",
          '\tgit push balena -f ',
          'Enable lock override from the dashboard.',
          'Disable the lock override from the dashboard.',
          '\tgit clone https://github.com/balena-io-playground/balena-updates-lock',
          '\tcd balena-updates-lock',
          "\tgit remote add balena YYY (copy the link from the application's dashboard)",
          '\tgit push balena',
          '\tcd balena-updates-lock',
          "\tsed -i 's/balena/resin/' start.sh",
          '\tgit add start.sh',
          '\tgit commit -m "resin"',
          '\tgit push balena -f',
          '\tgit clone https://github.com/resin-io-projects/simple-server-python',
          '\tcd simple-server-python',
          "\tgit remote add balena YYY (copy the link from the application's dashboard)",
          '\tgit push balena -f '
        ],
        assert: [
          'First application should be downloaded and installed, creating a lockfile i.e. "/tmp/balena/updates.lock"',
          'The new application should be downloaded but not installed.',
          'After enabling lock override, the new application should be installed and ran correctly.',
          'Lock override in the dashboard should show as disabled.',
          'First application should be downloaded and installed, creating a lockfile i.e. "/tmp/resin/updates.lock"',
          'The new application should be downloaded but not installed.'
        ]
      }),
      true
    );
  }
};
