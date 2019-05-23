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

const _ = require('lodash')
const path = require('path')
const utils = require('../lib/utils')

module.exports = {
  title: 'Test override lock',
  run: async (test, context, options, components) => {
    const hash = await utils.pushAndWaitRepoToBalenaDevice({
      path: path.join(options.tmpdir, 'balena-updates-lock'),
      url: 'https://github.com/balena-io-playground/balena-updates-lock',
      uuid: context.uuid,
      key: context.key.privateKeyPath,
      balena: components.balena,
      applicationName: options.applicationName
    })

    test.is(await components.balena.sdk.getDeviceCommit(context.uuid), hash)

    const hash2 = await utils.pushRepoToAppAndDoNotInstallIt({
      path: path.join(options.tmpdir, 'simple-server-python'),
      url: 'https://github.com/resin-io-projects/simple-server-python',
      uuid: context.uuid,
      key: context.key.privateKeyPath,
      balena: components.balena,
      applicationName: options.applicationName
    })

    test.is(await components.balena.sdk.getDeviceCommit(context.uuid), hash)

    await components.balena.sdk.enableLockOverride(context.uuid)

    await utils.waitUntil(async () => {
      const services = await components.balena.sdk.getAllServicesProperties(context.uuid, [ 'status' ])

      if (_.isEmpty(services)) {
        return false
      }

      return _.every(services, (service) => {
        return service === 'Running'
      })
    })

    test.is(await components.balena.sdk.getDeviceCommit(context.uuid), hash2)

    test.tearDown(async () => {
      await components.balena.sdk.disableLockOverride(context.uuid)
    })
  }
}
