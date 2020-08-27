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
const _ = require('lodash')
const balenaCLI = require('balena-cli')
const utils = require('../../lib/utils')
const BalenaOS = utils.requireComponent('os', 'balenaos')

const Bluebird = require('bluebird')
const realpath = Bluebird.promisify(require('fs').realpath)
const {
  basename
} = require('path')

const configuration = {
  network: 'ethernet'
}

module.exports = {
  title: 'Test Preload',
  run: async (test, context, options) => {
    const Worker = utils.getWorker(options.worker)
    const deviceTypeContract = require(`../contracts/contracts/hw.device-type/${options.deviceType}/contract.json`)
    const applicationNamePreload = `${options.applicationName}_Preload`
    console.log(`Creating application: ${applicationNamePreload} with device type ${options.deviceType}`)
    await context.balena.sdk.createApplication(applicationNamePreload, options.deviceType)

    console.log(`Creating device placeholder on ${applicationNamePreload}`)
    const placeholder = await context.balena.sdk.createDevicePlaceholder(applicationNamePreload)

    console.log(`Getting configuration for device ${placeholder.uuid}`)
    const balenaConfiguration = await context.balena.sdk.getDeviceOSConfiguration(
      placeholder.uuid, placeholder.deviceApiKey, _.assign({
        version: options.balenaOSVersion
      }, options.configuration)
    )

    context.os = new BalenaOS({
      imageName: 'preload',
      tmpdir: options.tmpdir,
      configuration: _.assign(balenaConfiguration, configuration),
      deviceType: options.deviceType,
      version: options.balenaOSVersion,
      url: options.apiStagingUrl
    })

    console.log('DashboardURL: ', await context.balena.sdk.getDashboardUrl(placeholder.uuid))

    await context.os.fetch()

    console.log(basename(await realpath(context.os.image)))

    const hash = await utils.pushRepoToApplicationPreload({
      path: path.join(options.tmpdir, 'preload'),
      url: 'https://github.com/balena-io/wifi-connect.git',
      uuid: context.balena.uuid,
      key: context.sshKeyPath,
      balena: context.balena,
      applicationName: applicationNamePreload
    })

    await balenaCLI.preload.action({
      image: context.os.image
    },
    {
      app: applicationNamePreload,
      commit: hash,
      'pin-device-to-release': true
    })

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
      return context.balena.sdk.isDeviceOnline(placeholder.uuid)
    })
    context.balena.uuid1 = placeholder.uuid

    test.is(await context.balena.sdk.getDeviceCommit(context.balena.uuid1), hash)

    const deviceLogs = await utils.getDeviceLogs({
      balena: context.balena,
      uuid: context.balena.uuid1
    })

    test.match([ deviceLogs ], [ /Hello, world!/ ], 'Application log outputs "Hello, world!"')
    test.notMatch([ deviceLogs ], [ /Downloading/ ], 'Device logs shouldn\'t output "Downloading"')

    test.is(await utils.runManualTestCase({
      prepare: [ 'Verify preload test...' ]
    }), true)

    await context.balena.sdk.removeApplication(applicationNamePreload)
  }
}
