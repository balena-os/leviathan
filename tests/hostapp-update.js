/*
 * Copyright 2017 resin.io
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
  title: 'Resin host OS update [<%= options.resinOSVersion %> -> <%= options.resinOSVersionUpdate %>]',
  run: async (test, context, options, components) => {
    const dockerVersion = options.resinOSVersionUpdate
      .replace('+', '_')
      .replace(/\.(prod|dev)$/, '')

    // This command will find the source (e.g. mmcblk0p2) for a given mountpoint
    const testCmd = (mountpoint) => {
      return `findmnt --noheadings --canonicalize --output SOURCE /mnt/sysroot/${mountpoint}`
    }

    const activeBefore = await components.resinio.sshHostOS(testCmd('active'), context.uuid, context.key.privateKeyPath)
    const inactiveBefore = await components.resinio.sshHostOS(testCmd('inactive'), context.uuid, context.key.privateKeyPath)

    const lastTimeOnline = await components.resinio.getLastConnectedTime(context.uuid)

    await components.resinio.sshHostOS(`hostapp-update -r -i resin/resinos-staging:${dockerVersion}-${options.deviceType}`,
      context.uuid,
      context.key.privateKeyPath
    )

    await utils.waitUntil(async () => {
      return await components.resinio.getLastConnectedTime(context.uuid) > lastTimeOnline
    })

    const activeAfter = await components.resinio.sshHostOS(testCmd('active'), context.uuid, context.key.privateKeyPath)
    const inactiveAfter = await components.resinio.sshHostOS(testCmd('inactive'), context.uuid, context.key.privateKeyPath)

    test.deepEqual([ activeBefore, inactiveBefore ], [ inactiveAfter, activeAfter ])
  }
}
