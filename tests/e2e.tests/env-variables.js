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

const path = require('path')
const utils = require('../../lib/utils')

module.exports = {
  title: 'Test setting a device environment variable',
  run: async (test, context, options) => {
    // const hash = await utils.pushAndWaitRepoToBalenaDevice({
    //   path: path.join(options.tmpdir, 'test'),
    //   url: 'https://github.com/balena-io-projects/balena-cpp-hello-world.git',
    //   uuid: context.balena.uuid,
    //   key: context.sshKeyPath,
    //   balena: context.balena,
    //   applicationName: options.applicationName
    // })
    //
    // test.is(await context.balena.sdk.getDeviceCommit(context.balena.uuid), hash)

    const applicationInfo = await context.balena.sdk.getApplicationInfo(context.balena.uuid)

    const applicationContainerName = await context.balena.sdk.executeCommandInHostOS(
      `balena ps -a -f id=${applicationInfo.containerId} --format '{{.Names}}'`,
      context.balena.uuid,
      context.sshKeyPath
    )

    const applicationContainerLastTimeStartedAtState = await context.balena.sdk.executeCommandInHostOS(
      `balena inspect --format='{{.State.StartedAt}}' ${applicationContainerName} | xargs date +%s -d`,
      context.balena.uuid,
      context.sshKeyPath
    )

    await context.balena.sdk.setDeviceEnvVariable(context.balena.uuid, 'WFOO', 'bar')

    await utils.waitUntil(async () => {
      return await context.balena.sdk.executeCommandInHostOS(
        `balena inspect --format='{{.State.StartedAt}}' ${applicationContainerName} | xargs date +%s -d`,
        context.balena.uuid,
        context.sshKeyPath
      ) > applicationContainerLastTimeStartedAtState
    })

    await test.is(await context.balena.sdk.getDeviceEnvVariable(context.balena.uuid, 'WFOO'), 'bar')

    // To do: ssh to application and check the variable was set

    // test.tearDown(async () => {
    //   await context.balena.sdk.removeDeviceEnvVariable(context.balena.uuid, 'WFOO')
    // })
  }
}
