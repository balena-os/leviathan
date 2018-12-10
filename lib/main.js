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
const AJV = require('ajv')
const Bluebird = require('bluebird')
const fse = require('fs-extra')
const fs = Bluebird.promisifyAll(require('fs'))
const Store = require('data-store')

const store = new Store(process.env.DATA_STORE, {
  base: process.env.DATA_STORE_PATH
})

const options = store.get('options')

fse.ensureDirSync(options.tmpdir)

const utils = require('./utils')
const BalenaOS = utils.requireComponent('os', 'balenaos')
const deviceTypeContract = require(`../contracts/contracts/hw.device-type/${options.deviceType}/contract.json`)

const balena = {
  sdk: new (utils.requireComponent('balena', 'sdk'))(options.apiUrl),
  sync: utils.requireComponent('balena', 'sync')
}

const Worker = utils.getWorker(options.worker)

const context = {
  uuid: null,
  key: null,
  dashboardUrl: null,
  os: null,
  filename: null,
  worker: null,
  deviceType: deviceTypeContract
}

const results = {
  author: null,
  deviceType: options.deviceType,
  provisionTime: null,
  imageSize: null,
  balenaOSVersion: options.balenaOSVersion
}

const setup = async () => {
  console.log('Logging into balena')
  await balena.sdk.loginWithToken(options.apiKey)

  console.log(`Creating application: ${options.applicationName} with device type ${options.deviceType}`)
  await balena.sdk.createApplication(options.applicationName, options.deviceType)

  context.key = await balena.sdk.createSSHKey(options.sshKeyLabel)

  console.log(`Add new SSH key: ${context.key.publicKey} with label: ${options.sshKeyLabel}`)

  if (options.delta) {
    console.log(options.delta === '1' ? 'Enabling delta' : 'Disabling delta')
    await balena.sdk.setAppConfigVariable(options.applicationName, 'RESIN_SUPERVISOR_DELTA', options.delta)
  }

  console.log(`Creating device placeholder on ${options.applicationName}`)
  const placeholder = await balena.sdk.createDevicePlaceholder(options.applicationName)

  console.log(`Getting configuration for device ${placeholder.uuid}`)
  const balenaConfiguration = await balena.sdk.getDeviceOSConfiguration(
    placeholder.uuid, placeholder.deviceApiKey, _.assign({
      version: options.balenaOSVersion
    }, options.configuration)
  )

  context.os = new BalenaOS({
    tmpdir: options.tmpdir,
    configuration: balenaConfiguration,
    deviceType: options.deviceType,
    version: options.balenaOSVersion,
    url: options.apiStagingUrl
  })

  await context.os.fetch()

  context.worker = new Worker('main worker', deviceTypeContract, {
    devicePath: options.device
  })

  await context.worker.ready()
  await context.worker.flash(context.os)
  await context.worker.on()

  console.log('Waiting while device boots')
  await utils.waitUntil(() => {
    return balena.sdk.isDeviceOnline(placeholder.uuid)
  })
  context.uuid = placeholder.uuid

  const uptime = await utils.getDeviceUptime((command) => {
    return balena.sdk.executeCommandInHostOS(command, context.uuid, context.key.privateKeyPath)
  })

  console.log('Gathering metrics')
  results.imageSize = `${(await fs.statAsync(await fs.realpathAsync(context.os.image))).size / 1048576.0} Mb`
  results.provisionTime = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`
  results.email = await balena.sdk.getEmail()

  console.log('Running tests:')
  context.dashboardUrl = await balena.sdk.getDashboardUrl(context.uuid)
}

const main = async () => {
  await setup()

  const tap = require('tap')

  tap.tearDown(async () => {
    await context.worker.off()

    store.set({
      results
    })
  })

  if (options.interactiveTests) {
    // TODO: These should be tested as provisioning variants
    // Allow the user to set image maker configuration options as env vars.
    if (options.deviceType === 'ts4900') {
      tap.test(`${options.deviceType}: Provision single model`, async (test) => {
        tap.resolveMatch(utils.runManualTestCase({
          do: [
            'Go into an existing ts4900 app or create a new one',
            'Select "single" as "CPU Cores"',
            'Select any "Network Connection" option',
            'Download the image and boot a single core variant of TS4900'
          ],
          assert: [ 'The device should successfully get provisioned and appear in dashboard' ]
        }), true)
      })

      tap.test(`${options.deviceType}: Provision quad model`, async (test) => {
        test.resolveMatch(utils.runManualTestCase({
          do: [
            'Go into an existing ts4900 app or create a new one',
            'Select "quad" as "CPU Cores"',
            'Select any "Network Connection" option',
            'Download the image and boot a single core variant of TS4900'
          ],
          assert: [ 'The device should successfully get provisioned and appear in dashboard' ]
        }), true)
      })
    }
  }

  _.each([
    require('../tests/device-online'),
    require('../tests/os-file-format'),
    require('../tests/device-reportOsVersion'),
    require('../tests/hostapp-update'),
    require('../tests/balena-sync'),
    require('../tests/push-container'),
    require('../tests/service-variables'),
    require('../tests/balena-device-progress'),
    require('../tests/update-supervisor-through-api'),
    require('../tests/push-multicontainer'),
    require('../tests/move-device-between-applications'),
    require('../tests/reload-supervisor'),
    require('../tests/bluetooth-test'),
    require('../tests/identification-led'),
    require('../tests/enter-container'),
    require('../tests/kernel-splash-screen'),
    require('../tests/balena-splash-screen'),
    require('../tests/reboot-with-app'),
    require('../tests/rpi-serial-uart0'),
    require('../tests/rpi-serial-uart1'),
    require('../tests/hdmi-uart5')
  ], (testCase) => {
    if (testCase.interactive && !options.interactiveTests) {
      return
    }

    if (testCase.deviceType) {
      const ajv = new AJV()
      if (!ajv.compile(testCase.deviceType)(deviceTypeContract)) {
        return
      }
    }

    tap.test(_.template(testCase.title)({
      options
    }), (test) => {
      console.log(`Starting Test: ${test.name}`)
      return testCase.run(test, context, options, {
        balena
      }).catch(async (error) => {
        test.threw(error)

        if (options.replOnFailure) {
          await utils.repl({
            balena,
            context,
            options
          }, {
            name: test.name
          })
        }
      })
    })
  })
}

main()
  .catch(async (err) => {
    console.error(err)
    process.exitCode = 1

    await context.worker.off()
  })
