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
  title: 'TC35 - Provision on supported modems',
  interactive: true,
  run: async function(context) {
    this.resolveMatch(
      context.utils.runManualTestCase({
        do: [
          'Download Device OS',
          'Configure the modem connection as documented here: https://docs.resin.io/reference/resinOS/network/2.x/#cellular-modem-setup',
          'Provision Device',
          'Push the following dockerfile.template to the application: FROM resin/%%RESIN_MACHINE_NAME%%-alpine:latest CMD ["cat", "/etc/os-release"]'
        ],
        assert: [
          "\tThe device should appear (provision) in the application's dashboard",
          '\tThe logs shown in the dashboard should look similar to the following (watch for the release version, slug/machine and variant fields to be the correct ones for the board you are testing)',
          '\tID="resin-os"',
          '\tNAME="Resin OS"',
          '\tVERSION="2.9.7+rev1"',
          '\tVERSION_ID="2.9.7"',
          '\tPRETTY_NAME="Resin OS 2.9.7+rev1"',
          '\tRESIN_BOARD_REV="1b12aa4"',
          '\tMETA_RESIN_REV="585641b"',
          '\tSLUG="odroid-xu4"',
          '\tMACHINE="odroid-xu4"',
          '\tVARIANT="Production"',
          '\tVARIANT_ID="prod"'
        ]
      }),
      true
    );
  }
};
