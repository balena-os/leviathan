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
const utils = require('../lib/utils')

module.exports = {
  title: 'Test setting a device environment variable',
  run: async (test, context, options, components) => {
    // const hash = await utils.pushAndWaitRepoToBalenaDevice({
    //   path: path.join(options.tmpdir, 'test'),
    //   url: 'https://github.com/balena-io-projects/balena-cpp-hello-world.git',
    //   uuid: context.uuid,
    //   key: context.key.privateKeyPath,
    //   balena: components.balena,
    //   applicationName: options.applicationName
    // })
    //
    // test.is(await components.balena.sdk.getDeviceCommit(context.uuid), hash)

    const applicationInfo = await components.balena.sdk.getApplicationInfo(context.uuid)

    const applicationContainerName = await components.balena.sdk.executeCommandInHostOS(
      `balena ps -a -f id=${applicationInfo.containerId} --format '{{.Names}}'`,
      context.uuid,
      context.key.privateKeyPath
    )

    const applicationContainerLastTimeStartedAtState = await components.balena.sdk.executeCommandInHostOS(
      `balena inspect --format='{{.State.StartedAt}}' ${applicationContainerName} | xargs date +%s -d`,
      context.uuid,
      context.key.privateKeyPath
    )

    await components.balena.sdk.setDeviceEnvVariable(context.uuid, 'FOO', 'bar')

    await utils.waitUntil(async () => {
      return await components.balena.sdk.executeCommandInHostOS(
        `balena inspect --format='{{.State.StartedAt}}' ${applicationContainerName} | xargs date +%s -d`,
        context.uuid,
        context.key.privateKeyPath
      ) > applicationContainerLastTimeStartedAtState
    })

    await test.is(await components.balena.sdk.getDeviceEnvVariable(context.uuid, 'FOO'), 'bar')

    // To do: ssh to application and check the variable was set

    // test.tearDown(async () => {
    //   await components.balena.sdk.removeDeviceEnvVariable(context.uuid, 'FOO')
    // })
  }
}
