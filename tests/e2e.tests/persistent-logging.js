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

const utils = require('../../lib/utils')

module.exports = {
  title: 'Test persistent logging',
  run: async (test, context, options) => {
    /* Enable "Persistent Logging" */
    let lastTimeOnline = await context.balena.sdk.getLastConnectedTime(context.balena.uuid)
    await context.balena.sdk.setDeviceConfigVariable(context.balena.uuid, 'RESIN_SUPERVISOR_PERSISTENT_LOGGING', true)
    await utils.waitUntil(async () => {
      return await context.balena.sdk.getLastConnectedTime(context.balena.uuid) > lastTimeOnline
    })
    await utils.waitUntil(async () => {
      return context.balena.sdk.isDeviceOnline(context.balena.uuid)
    })
    await utils.waitUntil(async () => {
      return await context.balena.sdk.executeCommandInHostOS(
        'balena inspect --format \'{{.State.Health.Status}}\' resin_supervisor',
        context.balena.uuid,
        context.sshKeyPath
      ) === 'starting'
    })

    /* Verify if "Persistent Logging" variable is enabled */
    await test.is(await context.balena.sdk.getDeviceConfigVariable(
      context.balena.uuid, 'RESIN_SUPERVISOR_PERSISTENT_LOGGING'), 'true', '"Persistent Logging" device config is enabled')

    /* Get list of boots */
    console.log('\nReboot no. 0')
    console.log(await context.balena.sdk.executeCommandInHostOS(
      'journalctl --list-boots',
      context.balena.uuid,
      context.sshKeyPath
    ))

    /* Reboot device 10 times */
    let iterate = 0
    while (iterate < 4) {
      lastTimeOnline = await context.balena.sdk.getLastConnectedTime(context.balena.uuid)
      await context.balena.sdk.rebootDevice(context.balena.uuid)
      await utils.waitUntil(async () => {
        return await context.balena.sdk.getLastConnectedTime(context.balena.uuid) > lastTimeOnline
      })
      await utils.waitUntil(async () => {
        return context.balena.sdk.isDeviceOnline(context.balena.uuid)
      })
      await utils.waitUntil(async () => {
        return await context.balena.sdk.executeCommandInHostOS(
          'balena inspect --format \'{{.State.Health.Status}}\' resin_supervisor',
          context.balena.uuid,
          context.sshKeyPath
        ) === 'starting'
      })

      /* Get list of boots */
      console.log('\nReboot no.', iterate + 1)
      console.log(await context.balena.sdk.executeCommandInHostOS(
        'journalctl --list-boots',
        context.balena.uuid,
        context.sshKeyPath
      ))

      iterate++
    }

    test.is(await utils.runManualTestCase({
      prepare: [ 'Verify the boot logs' ]
    }), true)

    /* Disable "Persistent Logging" */
    lastTimeOnline = await context.balena.sdk.getLastConnectedTime(context.balena.uuid)
    await context.balena.sdk.removeDeviceConfigVariable(context.balena.uuid, 'RESIN_SUPERVISOR_PERSISTENT_LOGGING')
    await utils.waitUntil(async () => {
      return await context.balena.sdk.getLastConnectedTime(context.balena.uuid) > lastTimeOnline
    })
    await utils.waitUntil(async () => {
      return context.balena.sdk.isDeviceOnline(context.balena.uuid)
    })
    await utils.waitUntil(async () => {
      return await context.balena.sdk.executeCommandInHostOS(
        'balena inspect --format \'{{.State.Health.Status}}\' resin_supervisor',
        context.balena.uuid,
        context.sshKeyPath
      ) === 'starting'
    })
  }
}
