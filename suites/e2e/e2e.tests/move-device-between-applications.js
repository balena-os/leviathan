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

module.exports = {
  title: 'Move device between applications',
  run: async function (context) {
    const hash = await context.utils.pushAndWaitRepoToBalenaDevice({
      path: path.join(context.tmpdir, 'test'),
      url: 'https://github.com/balena-io-projects/balena-cpp-hello-world.git',
      uuid: context.balena.uuid,
      key: context.privateKeyPath,
      balena: context.balena,
      applicationName: context.balena.application.name
    })

    this.is(await context.balena.sdk.getDeviceCommit(context.balena.uuid), hash)

    const applicationNameMoveDevice = `${context.balena.application.name}_MoveDevice`
    await context.balena.sdk.createApplication(applicationNameMoveDevice, context.deviceType.slug, {
      delta: context.balena.application.env.delta
    })

    const hashMoveDevice = await context.utils.pushRepoToApplication({
      path: path.join(context.tmpdir, 'test'),
      url: 'https://github.com/balena-io-projects/simple-server-node',
      key: context.privateKeyPath,
      balena: context.balena,
      applicationName: applicationNameMoveDevice
    })

    this.is(await context.balena.sdk.getApplicationCommit(applicationNameMoveDevice), hashMoveDevice)

    await context.utils.moveDeviceToApplication({
      uuid: context.balena.uuid,
      balena: context.balena,
      applicationName: applicationNameMoveDevice
    })

    this.is(await context.balena.sdk.getDeviceCommit(context.balena.uuid), hashMoveDevice)

    await context.utils.moveDeviceToApplication({
      uuid: context.balena.uuid,
      balena: context.balena,
      applicationName: context.balena.application.name
    })

    this.is(await context.balena.sdk.getDeviceCommit(context.balena.uuid), hash)

    this.tearDown(async () => {
      await context.balena.sdk.removeApplication(applicationNameMoveDevice)
    })
  }
}
