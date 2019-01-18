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

'use strict'

module.exports = {
  title: 'Verify chrony and NTP time sync',
  run: async (test, context, options, components) => {
    const chronydLog = await components.balena.sdk.executeCommandInHostOS(
      'systemctl status chronyd',
      context.uuid,
      context.key.privateKeyPath
    )
    test.match([ chronydLog ], [ /chronyd.service/ ], 'Service should contain chronyd.service')
    test.match([ chronydLog ], [ /active \(running\)/ ], 'Service should be active/running')

    const timedatectlLog = await components.balena.sdk.executeCommandInHostOS(
      'timedatectl',
      context.uuid,
      context.key.privateKeyPath
    )
    test.match([ timedatectlLog ], [ /System clock synchronized: yes/ ], 'System clock should be synchronized')

    const chronycLog = await components.balena.sdk.executeCommandInHostOS(
      'chronyc sources -n',
      context.uuid,
      context.key.privateKeyPath
    )
    test.match([ chronycLog ], [ /Number of sources = 4/ ], 'Number of sources = 4')
    test.match([ chronycLog ], [ /\^\*/ ], 'One of the sources should contain ^*')
  }
}
