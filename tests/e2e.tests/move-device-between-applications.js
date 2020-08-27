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
  title: 'Move device between applications',
  run: async (test, context, options, components) => {
    const hash = await utils.pushAndWaitRepoToBalenaDevice({
      path: path.join(options.tmpdir, 'test'),
      url: 'https://github.com/balena-io-projects/balena-cpp-hello-world.git',
      uuid: context.uuid,
      key: context.key.privateKeyPath,
      balena: components.balena,
      applicationName: options.applicationName
    })

    test.is(await components.balena.sdk.getDeviceCommit(context.uuid), hash)

    const applicationNameMoveDevice = `${options.applicationName}_MoveDevice`
    await components.balena.sdk.createApplication(applicationNameMoveDevice, options.deviceType)

    const hashMoveDevice = await utils.pushRepoToApplication({
      path: path.join(options.tmpdir, 'test'),
      url: 'https://github.com/balena-io-projects/simple-server-node',
      key: context.key.privateKeyPath,
      balena: components.balena,
      applicationName: applicationNameMoveDevice
    })

    test.is(await components.balena.sdk.getApplicationCommit(applicationNameMoveDevice), hashMoveDevice)

    await utils.moveDeviceToApplication({
      uuid: context.uuid,
      balena: components.balena,
      applicationName: applicationNameMoveDevice
    })

    test.is(await components.balena.sdk.getDeviceCommit(context.uuid), hashMoveDevice)

    await utils.moveDeviceToApplication({
      uuid: context.uuid,
      balena: components.balena,
      applicationName: options.applicationName
    })

    test.is(await components.balena.sdk.getDeviceCommit(context.uuid), hash)

    test.tearDown(async () => {
      await components.balena.sdk.removeApplication(applicationNameMoveDevice)
    })
  }
}
