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

const utils = require('../lib/utils')

module.exports = {
  title: 'Reload supervisor on a running device',
  run: async (test, context, options, components) => {
    // Delete current supervisor
    await components.balena.sdk.executeCommandInHostOS('systemctl stop resin-supervisor',
      context.uuid,
      context.key.privateKeyPath
    )
    await components.balena.sdk.executeCommandInHostOS('balena rm resin_supervisor',
      context.uuid,
      context.key.privateKeyPath
    )
    await components.balena.sdk.executeCommandInHostOS(
      `balena rmi -f $(balena images -q resin/${context.deviceType.data.arch}-supervisor)`,
      context.uuid,
      context.key.privateKeyPath
    )
    test.rejects(components.balena.sdk.pingSupervisor(context.uuid))

    // Pull and start the supervisor
    await components.balena.sdk.executeCommandInHostOS('update-resin-supervisor',
      context.uuid,
      context.key.privateKeyPath
    )

    // Wait for the supervisor to be marked as healthy
    await utils.waitUntil(async () => {
      return await components.balena.sdk.executeCommandInHostOS(
        'balena inspect --format \'{{.State.Health.Status}}\' resin_supervisor',
        context.uuid,
        context.key.privateKeyPath
      ) === 'healthy'
    })

    test.resolves(components.balena.sdk.pingSupervisor(context.uuid))
  }
}
