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
  title: 'Balena host OS update [<%= options.balenaOSVersionHostUpdateOldToNew %> -> <%= options.balenaOSVersionUpdate %>]',
  run: async (test, context, options, components) => {
    const applicationNameHostUpdate = `${options.applicationName}_HUP`
    console.log(`Creating application: ${applicationNameHostUpdate} with device type ${options.deviceType}`)
    await components.balena.sdk.createApplication(applicationNameHostUpdate, options.deviceType)

    console.log(`Creating device placeholder on ${applicationNameHostUpdate}`)
    const placeholder = await components.balena.sdk.createDevicePlaceholder(applicationNameHostUpdate)

    console.log(`Getting configuration for device ${placeholder.uuid}`)
    const balenaConfiguration = await components.balena.sdk.getDeviceOSConfiguration(
      placeholder.uuid, placeholder.deviceApiKey, _.assign({
        version: options.balenaOSVersionHostUpdateOldToNew
      }, options.configuration)
    )

    context.os = new BalenaOS({
      imageName: 'hostUpdate',
      tmpdir: options.tmpdir,
      configuration: _.assign(balenaConfiguration, options.configuration),
      deviceType: options.deviceType,
      version: options.balenaOSVersionHostUpdateOldToNew,
      url: options.apiStagingUrl
    })

    console.log('DashboardURL: ', await components.balena.sdk.getDashboardUrl(placeholder.uuid))

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

    const dockerVersion = options.balenaOSVersionUpdate
      .replace('+', '_')
      .replace(/\.(prod|dev)$/, '')

    // Run rollback tests:
    test.is(await utils.runManualTestCase({
      prepare: [ 'Run the rollback tests...' ]
    }), true)

    console.log(await components.balena.sdk.executeCommandInHostOS(
      `hostapp-update -i resin/resinos-staging:${dockerVersion}-${options.deviceType}`,
      context.uuid1,
      context.key.privateKeyPath
    ))

    const balenaEngineBinaryPath = await components.balena.sdk.executeCommandInHostOS(
      'find /mnt/sysroot/inactive | grep "/usr/bin/balena-engine$"',
      context.uuid1,
      context.key.privateKeyPath
    )
    console.log('Balena Engine Binary: ', balenaEngineBinaryPath)

    console.log('replace balena-engine with binary bash')
    await components.balena.sdk.executeCommandInHostOS(`cp /bin/bash ${balenaEngineBinaryPath}`,
      context.uuid1,
      context.key.privateKeyPath
    )

    const rollbackHealthScriptPath = await components.balena.sdk.executeCommandInHostOS(
      'find /mnt/sysroot/inactive | grep "bin/rollback-health"',
      context.uuid1,
      context.key.privateKeyPath
    )
    console.log('Rollback health script path: ', rollbackHealthScriptPath)
    console.log('replace roolback healt script path COUNT 15 with 2')
    await components.balena.sdk.executeCommandInHostOS(`sed -i "s/COUNT=.*/COUNT=2/g" ${rollbackHealthScriptPath}`,
      context.uuid1,
      context.key.privateKeyPath
    )

    console.log('Sync...')
    await components.balena.sdk.executeCommandInHostOS('sync',
      context.uuid1,
      context.key.privateKeyPath
    )

    const lastTimeOnlineBeforeReboot = await components.balena.sdk.getLastConnectedTime(context.uuid1)
    console.log(lastTimeOnlineBeforeReboot)

    console.log('Rebooting device...')
    await components.balena.sdk.executeCommandInHostOS('reboot',
      context.uuid1,
      context.key.privateKeyPath
    )

    await utils.waitUntil(async () => {
      console.log(await components.balena.sdk.getLastConnectedTime(context.uuid1))
      return await components.balena.sdk.getLastConnectedTime(context.uuid1) > lastTimeOnlineBeforeReboot
    })

    console.log('There should be rollback-*-breadcrumb files...')
    console.log(await components.balena.sdk.executeCommandInHostOS('ls /mnt/state',
      context.uuid1,
      context.key.privateKeyPath
    ))

    console.log('Journal logs of rollback-health service. The device should trigger a rollback in 2 minutes...')
    console.log(await components.balena.sdk.executeCommandInHostOS('journalctl -u rollback-health.service',
      context.uuid1,
      context.key.privateKeyPath
    ))

    console.log(`Get os-release file... It should show ${options.balenaOSVersion} ...`)
    console.log(await components.balena.sdk.executeCommandInHostOS('cat /etc/os-release',
      context.uuid1,
      context.key.privateKeyPath
    ))

    // Wait for device to reboot after 2 minutes
    const lastTimeOnlineAfterReboot = await components.balena.sdk.getLastConnectedTime(context.uuid1)
    await utils.waitUntil(async () => {
      console.log(await components.balena.sdk.getLastConnectedTime(context.uuid1))
      return await components.balena.sdk.getLastConnectedTime(context.uuid1) > lastTimeOnlineAfterReboot
    })

    test.is(await utils.runManualTestCase({
      prepare: [ 'Rollback test is done. Continue to test host update?' ]
    }), true)

    // Run hostapp update test
    // This command will find the source (e.g. mmcblk0p2) for a given mountpoint
    const testCmd = (mountpoint) => {
      return `findmnt --noheadings --canonicalize --output SOURCE /mnt/sysroot/${mountpoint}`
    }

    const activeBefore = await components.balena.sdk.executeCommandInHostOS(
      testCmd('active'),
      context.uuid1,
      context.key.privateKeyPath
    )
    const inactiveBefore = await components.balena.sdk.executeCommandInHostOS(
      testCmd('inactive'),
      context.uuid1,
      context.key.privateKeyPath
    )

    const lastTimeOnline = await components.balena.sdk.getLastConnectedTime(context.uuid1)

    await components.balena.sdk.executeCommandInHostOS(
      `hostapp-update -r -i resin/resinos-staging:${dockerVersion}-${options.deviceType}`,
      context.uuid1,
      context.key.privateKeyPath
    )

    await utils.waitUntil(async () => {
      return await components.balena.sdk.getLastConnectedTime(context.uuid1) > lastTimeOnline
    })

    const activeAfter = await components.balena.sdk.executeCommandInHostOS(
      testCmd('active'),
      context.uuid1,
      context.key.privateKeyPath
    )
    const inactiveAfter = await components.balena.sdk.executeCommandInHostOS(
      testCmd('inactive'),
      context.uuid1,
      context.key.privateKeyPath
    )

    test.deepEqual([ activeBefore, inactiveBefore ], [ inactiveAfter, activeAfter ])

    test.tearDown(async () => {
      await components.balena.sdk.removeApplication(applicationNameHostUpdate)
    })
  }
}
