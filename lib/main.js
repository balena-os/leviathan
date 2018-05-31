/*
 * Copyright 2017 resin.io
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

const ava = require('ava')
const _ = require('lodash')
const fse = require('fs-extra')
const fs = require('fs')
const path = require('path')
const Store = require('data-store')
const AJV = require('ajv')

const store = new Store(process.env.DATA_STORE, {
  base: process.env.DATA_STORE_PATH
})

const options = store.get('options')

fse.ensureDirSync(options.tmpdir)

const utils = require('./utils')
const Resinio = utils.requireComponent('resinio', 'sdk')
const resinos = utils.requireComponent('resinos', 'default')
const writer = utils.requireComponent('writer', 'etcher')
const deviceType = utils.requireComponent('device-type', options.deviceType)
const deviceTypeContract = require(`../contracts/contracts/hw.device-type/${options.deviceType}.json`)

const resinio = new Resinio(options.resinUrl)

const context = {
  uuid: null,
  key: null,
  dashboardUrl: null,
  gitUrl: null,
  filename: null,
  deviceType: deviceTypeContract
}

const results = {
  author: null,
  deviceType: options.deviceType,
  provisionTime: null,
  imageSize: null,
  resinOSVersion: options.resinOSVersion
}

ava.test.before(async () => {
  const imagePath = path.join(options.tmpdir, 'resin.img')

  console.log('Logging into resin.io')
  await resinio.loginWithToken(options.apiKey)

  console.log(`Creating application: ${options.applicationName} with device type ${options.deviceType}`)
  await resinio.createApplication(options.applicationName, options.deviceType)

  context.key = await resinio.createSSHKey(options.sshKeyLabel)
  console.log(`Add new SSH key: ${context.key.publicKey} with label: ${options.sshKeyLabel}`)

  console.log(`Downloading device type OS into ${imagePath}`)
  const downloadResinio = new Resinio(options.resinStagingUrl)
  context.filename = await downloadResinio.downloadDeviceTypeOS(options.deviceType, options.resinOSVersion, imagePath)

  if (options.delta) {
    console.log('Enabling deltas')
    await resinio.createEnvironmentVariable(options.applicationName, 'RESIN_SUPERVISOR_DELTA', options.delta)
  }

  console.log(`Creating device placeholder on ${options.applicationName}`)
  const placeholder = await resinio.createDevicePlaceholder(options.applicationName)

  console.log(`Getting resin.io configuration for device ${placeholder.uuid}`)
  const resinConfiguration = await resinio.getDeviceOSConfiguration(
    placeholder.uuid, placeholder.deviceApiKey, options.configuration)

  console.log(`Injecting resin.io configuration into ${imagePath}`)
  await resinos.injectResinConfiguration(imagePath, resinConfiguration)

  console.log(`Injecting network configuration into ${imagePath}`)
  await resinos.injectNetworkConfiguration(imagePath, options.configuration)

  console.log(`Provisioning ${options.disk} with ${imagePath}`)
  await deviceType.provision(imagePath, writer, {
    destination: options.disk
  })

  console.log('Waiting while device boots')
  await utils.waitUntil(() => {
    return resinio.isDeviceOnline(placeholder.uuid)
  })
  context.uuid = placeholder.uuid

  console.log('Waiting while supervisor starts')
  await utils.waitUntil(async () => {
    return await resinio.getDeviceStatus(placeholder.uuid) === 'Idle'
  })

  const uptime = await utils.getDeviceUptime((command) => {
    return resinio.sshHostOS(command, context.uuid, context.key.privateKeyPath)
  })

  console.log('Gathering metrics')
  results.imageSize = `${fs.statSync(imagePath).size / 1048576.0} Mb`
  results.provisionTime = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`
  results.email = await resinio.getEmail()

  console.log('Running tests:')
  context.dashboardUrl = await resinio.getDashboardUrl(context.uuid)
})

ava.test.after.always(async () => {
  store.set({
    results
  })
})

for (const testCase of [
  require('../tests/bluetooth-test'),
  require('../tests/device-online'),
  require('../tests/enter-container'),
  require('../tests/hdmi-uart5'),
  require('../tests/hostapp-update'),
  require('../tests/identification-led'),
  require('../tests/kernel-splash-screen'),
  require('../tests/os-file-format'),
  require('../tests/push-container'),
  require('../tests/push-multicontainer'),
  require('../tests/reboot-with-app'),
  require('../tests/reload-supervisor'),
  require('../tests/resin-device-progress'),
  require('../tests/resin-splash-screen'),
  require('../tests/resin-sync'),
  require('../tests/rpi-serial-uart0'),
  require('../tests/rpi-serial-uart1'),
  require('../tests/service-variables')
]) {
  if (testCase.interactive && !options.interactiveTests) {
    continue
  }

  if (testCase.deviceType) {
    const ajv = new AJV()
    if (!ajv.compile(testCase.deviceType)(deviceTypeContract)) {
      continue
    }
  }

  ava.test(_.template(testCase.title)({
    options
  }), async (test) => {
    await testCase.run(test, context, options, {
      resinio
    })
  })
}
