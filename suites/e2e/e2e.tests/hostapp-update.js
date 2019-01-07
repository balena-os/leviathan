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

module.exports = {
  title: 'Balena host OS update [<%= options.os.image.version%> -> latest]',
  run: async function (context) {
    // This command will find the source (e.g. mmcblk0p2) for a given mountpoint
    const testCmd = (mountpoint) => {
      return `findmnt --noheadings --canonicalize --output SOURCE /mnt/sysroot/${mountpoint}`
    }

    const activeBefore = await context.balena.sdk.executeCommandInHostOS(
      testCmd('active'),
      context.balena.uuid
    )
    const inactiveBefore = await context.balena.sdk.executeCommandInHostOS(
      testCmd('inactive'),
      context.balena.uuid
    )

    const lastTimeOnline = await context.balena.sdk.getLastConnectedTime(context.balena.uuid)

    await context.balena.sdk.executeCommandInHostOS(
      context.os.hostappCommand(),
      context.balena.uuid
    )

    await context.utils.waitUntil(async () => {
      return await context.balena.sdk.getLastConnectedTime(context.balena.uuid) > lastTimeOnline
    })

    const activeAfter = await context.balena.sdk.executeCommandInHostOS(
      testCmd('active'),
      context.balena.uuid
    )
    const inactiveAfter = await context.balena.sdk.executeCommandInHostOS(
      testCmd('inactive'),
      context.balena.uuid
    )

    this.deepEqual([ activeBefore, inactiveBefore ], [ inactiveAfter, activeAfter ])
  }
}
