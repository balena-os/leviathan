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
const path = require('path')
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

const configuration = {
  network: 'cellular',
  cellular: {
    password: '',
    username: '',
    apn: 'net',
    number: '',
    autoconnect: 'true'
  }
}

module.exports = {
  title: 'Cellular modem connection',
  run: async (test, context, options, components) => {
    const applicationNameModem = `${options.applicationName}_Modem`
    console.log(`Creating application: ${applicationNameModem} with device type ${options.deviceType}`)
    await components.balena.sdk.createApplication(applicationNameModem, options.deviceType)

    console.log(`Creating device placeholder on ${applicationNameModem}`)
    const placeholder = await components.balena.sdk.createDevicePlaceholder(applicationNameModem)

    console.log(`Getting configuration for device ${placeholder.uuid}`)
    const balenaConfiguration = await components.balena.sdk.getDeviceOSConfiguration(
      placeholder.uuid, placeholder.deviceApiKey, _.assign({
        version: options.balenaOSVersion
      }, options.configuration)
    )

    context.os = new BalenaOS({
      imageName: 'modem',
      tmpdir: options.tmpdir,
      configuration: _.assign(balenaConfiguration, configuration),
      deviceType: options.deviceType,
      version: options.balenaOSVersion,
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

    const clonePath = path.join(options.tmpdir, 'modem')
    const hash = await utils.pushAndWaitRepoToBalenaDevice({
      path: clonePath,
      url: 'https://github.com/horia-delicoti/modem.git',
      uuid: context.uuid1,
      key: context.key.privateKeyPath,
      balena: components.balena,
      applicationName: options.applicationName
    })

    test.is(await components.balena.sdk.getDeviceCommit(context.uuid1), hash)

    test.is(await utils.runManualTestCase({
      prepare: [ 'Waiting for you to investigate the device...' ]
    }), true)

    test.tearDown(async () => {
      await components.balena.sdk.removeApplication(applicationNameModem)
    })
  }
}
