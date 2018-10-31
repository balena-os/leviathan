/*
 * Copyright 2017 balena
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
  title: 'Balena host OS update [<%= options.balenaOSVersion %> -> <%= options.balenaOSVersionUpdate %>]',
  run: async (test, context, options, components) => {
    const dockerVersion = options.balenaOSVersionUpdate
      .replace('+', '_')
      .replace(/\.(prod|dev)$/, '')

    // This command will find the source (e.g. mmcblk0p2) for a given mountpoint
    const testCmd = (mountpoint) => {
      return `findmnt --noheadings --canonicalize --output SOURCE /mnt/sysroot/${mountpoint}`
    }

    console.log('\n[Hostapp update] check activeBefore: ',
      await components.balena.sshHostOS(testCmd('active'), context.uuid, context.key.privateKeyPath))
    const activeBefore = await components.balena.sshHostOS(testCmd('active'), context.uuid, context.key.privateKeyPath)
    console.log('\n[Hostapp update] check inactiveBefore: ',
      await components.balena.sshHostOS(testCmd('inactive'), context.uuid, context.key.privateKeyPath))
    const inactiveBefore = await components.balena.sshHostOS(testCmd('inactive'), context.uuid, context.key.privateKeyPath)

    const lastTimeOnline = await components.balena.getLastConnectedTime(context.uuid)
    console.log(`\n[Hostapp update] last time Online: ${lastTimeOnline}`)

    console.log(await components.balena.sshHostOS(
      `hostapp-update -r -i resin/resinos-staging:${dockerVersion}-${options.deviceType}`,
      context.uuid,
      context.key.privateKeyPath
    ))

    await utils.waitUntil(async () => {
      console.log('\n[Hostapp update] get last connected time: ', await components.balena.getLastConnectedTime(context.uuid))
      return await components.balena.getLastConnectedTime(context.uuid) > lastTimeOnline
    })

    console.log('\n[Hostapp update] check activeAfter',
      await components.balena.sshHostOS(testCmd('active'), context.uuid, context.key.privateKeyPath))
    const activeAfter = await components.balena.sshHostOS(testCmd('active'), context.uuid, context.key.privateKeyPath)
    console.log('\n[Hostapp update] check inactiveAfter',
      await components.balena.sshHostOS(testCmd('inactive'), context.uuid, context.key.privateKeyPath))
    const inactiveAfter = await components.balena.sshHostOS(testCmd('inactive'), context.uuid, context.key.privateKeyPath)

    test.deepEqual([ activeBefore, inactiveBefore ], [ inactiveAfter, activeAfter ])
  }
}
