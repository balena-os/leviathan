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
const request = require('request-promise')
const utils = require('../../lib/utils')

module.exports = {
  title: 'Sync application container',
  run: async (test, context, options) => {
    const clonePath = path.join(options.tmpdir, 'test-sync')
    const hash = await utils.pushAndWaitRepoToBalenaDevice({
      path: clonePath,
      url: 'https://github.com/balena-io-projects/simple-server-python.git',
      uuid: context.balena.uuid,
      key: context.sshKeyPath,
      balena: context.balena,
      applicationName: options.applicationName
    })

    test.is(await context.balena.sdk.getDeviceCommit(context.balena.uuid), hash)

    await context.balena.sdk.enableDeviceUrl(context.balena.uuid)
    const deviceUrl = await context.balena.sdk.getDeviceUrl(context.balena.uuid)

    test.is(await request(deviceUrl), 'Hello World!')

    await utils.searchAndReplace(
      path.join(clonePath, 'src/main.py'),
      '\'Hello World!\'',
      '\'Hello World Synced!\''
    )

    await context.balena.sync.remote(context.balena.uuid, clonePath, '/usr/src/app')

    await utils.waitUntil(async () => {
      const services = await context.balena.sdk.getAllServicesProperties(context.balena.uuid, [ 'status' ])

      if (_.isEmpty(services)) {
        return false
      }

      return _.every(services, (service) => {
        return service === 'Running'
      })
    })

    test.is(await request(deviceUrl), 'Hello World Synced!')

    test.tearDown(async () => {
      await context.balena.sdk.disableDeviceUrl(context.balena.uuid)
    })
  }
}
