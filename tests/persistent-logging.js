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
  title: 'Test persistent logging',
  run: async (test, context, options, components) => {
    /* Enable "Persistent Logging" */
    let lastTimeOnline = await components.balena.sdk.getLastConnectedTime(context.uuid)
    await components.balena.sdk.setDeviceConfigVariable(context.uuid, 'RESIN_SUPERVISOR_PERSISTENT_LOGGING', true)
    await utils.waitUntil(async () => {
      return await components.balena.sdk.getLastConnectedTime(context.uuid) > lastTimeOnline
    })
    await utils.waitUntil(async () => {
      return components.balena.sdk.isDeviceOnline(context.uuid)
    })
    await utils.waitUntil(async () => {
      return await components.balena.sdk.executeCommandInHostOS(
        'balena inspect --format \'{{.State.Health.Status}}\' resin_supervisor',
        context.uuid,
        context.key.privateKeyPath
      ) === 'starting'
    })

    /* Verify if "Persistent Logging" variable is enabled */
    await test.is(await components.balena.sdk.getDeviceConfigVariable(
      context.uuid, 'RESIN_SUPERVISOR_PERSISTENT_LOGGING'), 'true', '"Persistent Logging" device config is enabled')

    /* Get list of boots */
    console.log('\nReboot no. 0')
    console.log(await components.balena.sdk.executeCommandInHostOS(
      'journalctl --list-boots',
      context.uuid,
      context.key.privateKeyPath
    ))

    /* Reboot device 10 times */
    let iterate = 0
    while (iterate < 6) {
      lastTimeOnline = await components.balena.sdk.getLastConnectedTime(context.uuid)
      await components.balena.sdk.rebootDevice(context.uuid)
      await utils.waitUntil(async () => {
        return await components.balena.sdk.getLastConnectedTime(context.uuid) > lastTimeOnline
      })
      await utils.waitUntil(async () => {
        return components.balena.sdk.isDeviceOnline(context.uuid)
      })
      await utils.waitUntil(async () => {
        return await components.balena.sdk.executeCommandInHostOS(
          'balena inspect --format \'{{.State.Health.Status}}\' resin_supervisor',
          context.uuid,
          context.key.privateKeyPath
        ) === 'starting'
      })

      /* Get list of boots */
      console.log('\nReboot no.', iterate + 1)
      console.log(await components.balena.sdk.executeCommandInHostOS(
        'journalctl --list-boots',
        context.uuid,
        context.key.privateKeyPath
      ))

      iterate++
    }

    test.is(await utils.runManualTestCase({
      prepare: [ 'Verify the boot logs' ]
    }), true)

    /* Disable "Persistent Logging" */
    lastTimeOnline = await components.balena.sdk.getLastConnectedTime(context.uuid)
    await components.balena.sdk.removeDeviceConfigVariable(context.uuid, 'RESIN_SUPERVISOR_PERSISTENT_LOGGING')
    await utils.waitUntil(async () => {
      return await components.balena.sdk.getLastConnectedTime(context.uuid) > lastTimeOnline
    })
    await utils.waitUntil(async () => {
      return components.balena.sdk.isDeviceOnline(context.uuid)
    })
    await utils.waitUntil(async () => {
      return await components.balena.sdk.executeCommandInHostOS(
        'balena inspect --format \'{{.State.Health.Status}}\' resin_supervisor',
        context.uuid,
        context.key.privateKeyPath
      ) === 'starting'
    })
  }
}
