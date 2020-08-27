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

const utils = require('../../lib/utils')
const BalenaOS = utils.requireComponent('os', 'balenaos')
const _ = require('lodash')

const Bluebird = require('bluebird')
const realpath = Bluebird.promisify(require('fs').realpath)
const {
  basename
} = require('path')

module.exports = {
  title: 'Balena host OS update [<%= options.balenaOSVersionHostUpdateOldToNew %> -> <%= options.balenaOSVersionUpdate %>]',
  run: async (test, context, options) => {
    const Worker = utils.getWorker(options.worker)
    const deviceTypeContract = require(`../contracts/contracts/hw.device-type/${options.deviceType}/contract.json`)
    const applicationNameHostUpdate = `${options.applicationName}_HUP`
    console.log(`Creating application: ${applicationNameHostUpdate} with device type ${options.deviceType}`)
    await context.balena.sdk.createApplication(applicationNameHostUpdate, options.deviceType)

    console.log(`Creating device placeholder on ${applicationNameHostUpdate}`)
    const placeholder = await context.balena.sdk.createDevicePlaceholder(applicationNameHostUpdate)

    console.log(`Getting configuration for device ${placeholder.uuid}`)
    const balenaConfiguration = await context.balena.sdk.getDeviceOSConfiguration(
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

    console.log('DashboardURL: ', await context.balena.sdk.getDashboardUrl(placeholder.uuid))

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
      return context.balena.sdk.isDeviceOnline(placeholder.uuid)
    })
    context.balena.uuid1 = placeholder.uuid

    const dockerVersion = options.balenaOSVersionUpdate
      .replace('+', '_')
      .replace(/\.(prod|dev)$/, '')

    // Run rollback tests:
    test.is(await utils.runManualTestCase({
      prepare: [ 'Run the rollback tests...' ]
    }), true)

    console.log(await context.balena.sdk.executeCommandInHostOS(
      `hostapp-update -i resin/resinos-staging:${dockerVersion}-${options.deviceType}`,
      context.balena.uuid1,
      context.sshKeyPath
    ))

    const balenaEngineBinaryPath = await context.balena.sdk.executeCommandInHostOS(
      'find /mnt/sysroot/inactive | grep "/usr/bin/balena-engine$"',
      context.balena.uuid1,
      context.sshKeyPath
    )
    console.log('Balena Engine Binary: ', balenaEngineBinaryPath)

    console.log('replace balena-engine with binary bash')
    await context.balena.sdk.executeCommandInHostOS(`cp /bin/bash ${balenaEngineBinaryPath}`,
      context.balena.uuid1,
      context.sshKeyPath
    )

    const rollbackHealthScriptPath = await context.balena.sdk.executeCommandInHostOS(
      'find /mnt/sysroot/inactive | grep "bin/rollback-health"',
      context.balena.uuid1,
      context.sshKeyPath
    )
    console.log('Rollback health script path: ', rollbackHealthScriptPath)
    console.log('replace roolback healt script path COUNT 15 with 2')
    await context.balena.sdk.executeCommandInHostOS(`sed -i "s/COUNT=.*/COUNT=2/g" ${rollbackHealthScriptPath}`,
      context.balena.uuid1,
      context.sshKeyPath
    )

    console.log('Sync...')
    await context.balena.sdk.executeCommandInHostOS('sync',
      context.balena.uuid1,
      context.sshKeyPath
    )

    const lastTimeOnlineBeforeReboot = await context.balena.sdk.getLastConnectedTime(context.balena.uuid1)
    console.log(lastTimeOnlineBeforeReboot)

    console.log('Rebooting device...')
    await context.balena.sdk.executeCommandInHostOS('reboot',
      context.balena.uuid1,
      context.sshKeyPath
    )

    await utils.waitUntil(async () => {
      console.log(await context.balena.sdk.getLastConnectedTime(context.balena.uuid1))
      return await context.balena.sdk.getLastConnectedTime(context.balena.uuid1) > lastTimeOnlineBeforeReboot
    })

    console.log('There should be rollback-*-breadcrumb files...')
    console.log(await context.balena.sdk.executeCommandInHostOS('ls /mnt/state',
      context.balena.uuid1,
      context.sshKeyPath
    ))

    console.log('Journal logs of rollback-health service. The device should trigger a rollback in 2 minutes...')
    console.log(await context.balena.sdk.executeCommandInHostOS('journalctl -u rollback-health.service',
      context.balena.uuid1,
      context.sshKeyPath
    ))

    console.log(`Get os-release file... It should show ${options.balenaOSVersion} ...`)
    console.log(await context.balena.sdk.executeCommandInHostOS('cat /etc/os-release',
      context.balena.uuid1,
      context.sshKeyPath
    ))

    // Wait for device to reboot after 2 minutes
    const lastTimeOnlineAfterReboot = await context.balena.sdk.getLastConnectedTime(context.balena.uuid1)
    await utils.waitUntil(async () => {
      console.log(await context.balena.sdk.getLastConnectedTime(context.balena.uuid1))
      return await context.balena.sdk.getLastConnectedTime(context.balena.uuid1) > lastTimeOnlineAfterReboot
    })

    test.is(await utils.runManualTestCase({
      prepare: [ 'Rollback test is done. Continue to test host update?' ]
    }), true)

    // Run hostapp update test
    // This command will find the source (e.g. mmcblk0p2) for a given mountpoint
    const testCmd = (mountpoint) => {
      return `findmnt --noheadings --canonicalize --output SOURCE /mnt/sysroot/${mountpoint}`
    }

    const activeBefore = await context.balena.sdk.executeCommandInHostOS(
      testCmd('active'),
      context.balena.uuid1,
      context.sshKeyPath
    )
    const inactiveBefore = await context.balena.sdk.executeCommandInHostOS(
      testCmd('inactive'),
      context.balena.uuid1,
      context.sshKeyPath
    )

    const lastTimeOnline = await context.balena.sdk.getLastConnectedTime(context.balena.uuid1)

    await context.balena.sdk.executeCommandInHostOS(
      `hostapp-update -r -i resin/resinos-staging:${dockerVersion}-${options.deviceType}`,
      context.balena.uuid1,
      context.sshKeyPath
    )

    await utils.waitUntil(async () => {
      return await context.balena.sdk.getLastConnectedTime(context.balena.uuid1) > lastTimeOnline
    })

    const activeAfter = await context.balena.sdk.executeCommandInHostOS(
      testCmd('active'),
      context.balena.uuid1,
      context.sshKeyPath
    )
    const inactiveAfter = await context.balena.sdk.executeCommandInHostOS(
      testCmd('inactive'),
      context.balena.uuid1,
      context.sshKeyPath
    )

    test.deepEqual([ activeBefore, inactiveBefore ], [ inactiveAfter, activeAfter ])

    test.tearDown(async () => {
      await context.balena.sdk.removeApplication(applicationNameHostUpdate)
    })
  }
}
