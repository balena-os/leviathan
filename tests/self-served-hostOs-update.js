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

const balena = {
  sdk: new (utils.requireComponent('balena', 'sdk'))(options.apiStagingUrl),
  sync: utils.requireComponent('balena', 'sync')
}

const Bluebird = require('bluebird')
const realpath = Bluebird.promisify(require('fs').realpath)
const {
  basename
} = require('path')

module.exports = {
  title: 'Self served HostOS update [<%= options.balenaOSVersionSelfUpdateOldToNew %> -> <%= options.balenaOSVersionUpdate %>]',
  run: async (test, context, options, components) => {
    console.log('Logging into balena-staging')
    await balena.sdk.loginWithToken(options.apiKeyStaging)

    const applicationNameSelfUpdate = `${options.applicationName}_SelfUpdate`
    console.log(`Creating application: ${applicationNameSelfUpdate} with device type ${options.deviceType}`)
    await balena.sdk.createApplication(applicationNameSelfUpdate, options.deviceType)

    console.log(`Creating device placeholder on ${applicationNameSelfUpdate}`)
    const placeholder = await balena.sdk.createDevicePlaceholder(applicationNameSelfUpdate)

    console.log(`Getting configuration for device ${placeholder.uuid}`)
    const balenaConfiguration = await balena.sdk.getDeviceOSConfiguration(
      placeholder.uuid, placeholder.deviceApiKey, _.assign({
        version: options.balenaOSVersionSelfUpdateOldToNew
      }, options.configuration)
    )

    context.os = new BalenaOS({
      imageName: 'selfUpdate',
      tmpdir: options.tmpdir,
      configuration: _.assign(balenaConfiguration, options.configuration),
      deviceType: options.deviceType,
      version: options.balenaOSVersionSelfUpdateOldToNew,
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
      return balena.sdk.isDeviceOnline(placeholder.uuid)
    })
    context.uuid1 = placeholder.uuid

    test.is(await utils.runManualTestCase({
      prepare: [ 'Update balenaOS from dashboard...' ]
    }), true)

    test.tearDown(async () => {
      await balena.sdk.removeApplication(applicationNameSelfUpdate)
      await components.balena.sdk.loginWithToken(options.apiKey)
    })
  }
}
