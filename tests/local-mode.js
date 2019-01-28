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
const BalenaOS = utils.requireComponent('os', 'balenaos')
const _ = require('lodash')
const Store = require('data-store')
const store = new Store(process.env.DATA_STORE, {
  base: process.env.DATA_STORE_PATH
})
const options = store.get('options')
const Worker = utils.getWorker(options.worker)

const deviceTypeContract = require(`../contracts/contracts/hw.device-type/${options.deviceType}/contract.json`)

const Bluebird = require('bluebird')
const realpath = Bluebird.promisify(require('fs').realpath)
const {
  basename
} = require('path')

module.exports = {
  title: 'Test local mode',
  run: async (test, context, options, components) => {
    const applicationNameLocalMode = `${options.applicationName}_LocalMode`
    console.log(`Creating application: ${applicationNameLocalMode} with device type ${options.deviceType}`)
    await components.balena.sdk.createApplication(applicationNameLocalMode, options.deviceType)

    console.log(`Creating device placeholder on ${applicationNameLocalMode}`)
    const placeholder = await components.balena.sdk.createDevicePlaceholder(applicationNameLocalMode)

    const balenaOSVersionDevEdition = options.balenaOSVersion
      .replace(/\.(prod|dev)$/, '.dev')

    console.log(`Getting configuration for device ${placeholder.uuid}`)
    const balenaConfiguration = await components.balena.sdk.getDeviceOSConfiguration(
      placeholder.uuid, placeholder.deviceApiKey, _.assign({
        version: balenaOSVersionDevEdition
      }, options.configuration)
    )

    context.os = new BalenaOS({
      imageName: 'LocalMode',
      tmpdir: options.tmpdir,
      configuration: balenaConfiguration,
      deviceType: options.deviceType,
      version: balenaOSVersionDevEdition,
      url: options.apiStagingUrl
    })

    await context.os.fetch()

    console.log(basename(await realpath(context.os.image)))

    context.worker = new Worker('main worker', deviceTypeContract, {
      devicePath: options.device
    })

    if (options.worker === 'manual') {
      test.is(await utils.runManualTestCase({
        prepare: [ 'Please have a flash drive inserted...' ]
      }), true)
    }

    await context.worker.ready()
    await context.worker.flash(context.os)
    await context.worker.on()

    console.log('Waiting while device boots')
    await utils.waitUntil(() => {
      return components.balena.sdk.isDeviceOnline(placeholder.uuid)
    })
    context.uuid1 = placeholder.uuid

    await components.balena.sdk.setDeviceConfigVariable(context.uuid1, 'RESIN_SUPERVISOR_LOCAL_MODE', '1')

    test.is(await utils.runManualTestCase({
      do: [ 'balena push "deviceIP"' ]
    }), true)

    test.tearDown(async () => {
      await components.balena.sdk.removeApplication(applicationNameLocalMode)
    })
  }
}
