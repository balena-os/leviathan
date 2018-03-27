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
const fse = require('fs-extra')
const path = require('path')

const git = require('simple-git/promise')

const options = {
  deviceType: process.env.RESINOS_TESTS_DEVICE_TYPE,
  resinOSVersion: process.env.RESINOS_TESTS_RESINOS_VERSION,
  resinOSVersionUpdate: process.env.RESINOS_TESTS_RESINOS_VERSION_UPDATE,
  applicationName: process.env.RESINOS_TESTS_APPLICATION_NAME,
  disk: process.env.RESINOS_TESTS_DISK,
  email: process.env.RESINOS_TESTS_EMAIL,
  password: process.env.RESINOS_TESTS_PASSWORD,
  tmpdir: process.env.RESINOS_TESTS_TMPDIR,
  api: process.env.RESINOS_TESTS_RESINIO_API_URL,
  downloadApi: process.env.RESINOS_TESTS_RESINIO_STAGING_API_URL,
  delta: process.env.RESINOS_TESTS_RESIN_SUPERVISOR_DELTA,
  configuration: {
    network: 'ethernet'
  }
}

fse.ensureDirSync(options.tmpdir)

const utils = require('./utils')
const Resinio = utils.requireComponent('resinio', 'sdk')
const resinos = utils.requireComponent('resinos', 'default')
const writer = utils.requireComponent('writer', 'etcher')
const deviceType = utils.requireComponent('device-type', options.deviceType)
const deviceTypeContract = require(`../contracts/contracts/hw.device-type/${options.deviceType}.json`)

const resinio = new Resinio(options.api)

const context = {
  uuid: null,
  key: null
}

ava.test.before(async () => {
  const imagePath = path.join(options.tmpdir, 'resin.img')

  console.log('Logging into resin.io')
  await resinio.loginWithCredentials({
    email: options.email,
    password: options.password
  })

  console.log(`Creating application: ${options.applicationName} with device type ${options.deviceType}`)
  await resinio.createApplication(options.applicationName, options.deviceType)

  console.log('Remove previous SSH keys')
  await resinio.removeSSHKeys()
  context.key = await resinio.createSSHKey()
  console.log(`Add new SSH key: ${context.key.publicKey}`)

  console.log(`Downloading device type OS into ${imagePath}`)
  const downloadResinio = new Resinio(options.downloadApi)
  await downloadResinio.downloadDeviceTypeOS(options.deviceType, options.resinOSVersion, imagePath)

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
  await utils.waitUntil(async () => {
    return resinio.isDeviceOnline(placeholder.uuid)
  })

  console.log('Running tests:')
  context.uuid = placeholder.uuid
})

ava.test('Device is online', async (test) => {
  const isOnline = await resinio.isDeviceOnline(context.uuid)
  test.true(isOnline)
})

ava.test.skip('Device reported hostOS version', async (test) => {
  const version = await resinio.getDeviceHostOSVersion(context.uuid)
  test.is(version, 'Resin OS 2.0.6+rev3')
})

ava.test('Device has started application', async (test) => {
  const GIT_SSH_COMMAND = `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i ${context.key.privateKeyPath}`
  const remote = 'resin'
  const repositoryPath = path.join(options.tmpdir, 'test')
  const gitUrl = await resinio.getApplicationGitRemote(options.applicationName)

  await fse.remove(repositoryPath)
  await git().clone('https://github.com/resin-io-projects/resin-cpp-hello-world.git', repositoryPath)
  await git(repositoryPath).addRemote(remote, gitUrl)
  await git(repositoryPath).env('GIT_SSH_COMMAND', GIT_SSH_COMMAND).push(remote, 'master')

  await utils.waitUntil(async () => {
    return await resinio.getDeviceStatus(context.uuid) === 'Downloading'
  })
  await utils.waitUntil(async () => {
    return await resinio.getDeviceStatus(context.uuid) === 'Idle'
  })

  const commit = await resinio.getDeviceCommit(context.uuid)
  test.is(commit.length, 40)
})

ava.test.serial(`resin host OS update [${options.resinOSVersion} -> ${options.resinOSVersionUpdate}]`, async (test) => {
  const dockerVersion = options.resinOSVersion
    .replace('+', '_')
    .replace(/\.(prod|dev)$/, '')

  // This command will find the source (e.g. mmcblk0p2) for a given mountpoint
  const testCmd = (mountpoint) => {
    return `findmnt --noheadings --canonicalize --output SOURCE /mnt/sysroot/${mountpoint}`
  }

  const activeBefore = await resinio.sshHostOS(testCmd('active'), context.uuid, context.key.privateKeyPath)
  const inactiveBefore = await resinio.sshHostOS(testCmd('inactive'), context.uuid, context.key.privateKeyPath)

  await resinio.sshHostOS(`hostapp-update -r -i resin/resinos:${dockerVersion}-${options.deviceType}`,
    context.uuid,
    context.key.privateKeyPath
  )

  await utils.waitUntil(async () => {
    return !await resinio.isDeviceOnline(context.uuid)
  })
  await utils.waitUntil(async () => {
    return resinio.isDeviceOnline(context.uuid)
  })

  const activeAfter = await resinio.sshHostOS(testCmd('active'), context.uuid, context.key.privateKeyPath)
  const inactiveAfter = await resinio.sshHostOS(testCmd('inactive'), context.uuid, context.key.privateKeyPath)

  test.deepEqual([ activeBefore, inactiveBefore ], [ inactiveAfter, activeAfter ])
})

if (!process.env.CI) {
  ava.test('experience: Enter running application container', async (test) => {
    return utils.runManualTestCase(test, {
      prepare: [ 'Ensure the device is running an application' ],
      do: [ `Run 'resin ssh ${context.uuid}'` ],
      assert: [
        'A shell prompt should appear after a few seconds',
        'Running `env | grep RESIN_DEVICE_NAME_AT_INIT` should return the device name listed in the dashboard'
      ]
    })
  })

  ava.test('experience: Sync application container', async (test) => {
    return utils.runManualTestCase(test, {
      prepare: [
        'Clone "https://github.com/resin-io-projects/simple-server-node" inside container and push it to application',
        'Enable Public Device URL'
      ],
      do: [
        'Ensure the device is running an application',
        'Confirm that the web server shows a "Hello World" message',
        'Edit server.js on the cloned application so that `res.send()` returns a different message',
        `Go to the cloned app directory and run 'resin sync ${context.uuid} -s . -d /usr/src/app'`
      ],
      assert: [
        'The sync process should start with a status message appearing on each step',
        'A "resin sync completed successfully!" message should appear at the end',
        'The device\'s Public Device URL should now show the new response message'
      ],
      cleanup: [
        'Disable Public Device URL',
        'Restart application from the dashboard'
      ]
    })
  })

  ava.test('graphics: Kernel boot logo', async (test) => {
    return utils.runManualTestCase(test, {
      prepare: [ 'Plug a monitor in the device\'s HDMI output' ],
      do: [ 'Reboot the device' ],
      assert: [ 'The Tux (Linux) logo should not be visible on the screen' ]
    })
  })

  ava.test('graphics: Reboot splash screen', async (test) => {
    return utils.runManualTestCase(test, {
      prepare: [ 'Plug a monitor in the device\'s HDMI output' ],
      do: [ 'Reboot the device' ],
      assert: [
        'The Resin.io logo splash screen should be visible when the board initiates reboot',
        'The Resin.io logo splash screen should be visible during boot-up'
      ]
    })
  })

  ava.test('graphics: Boot/Shutdown splash screen', async (test) => {
    return utils.runManualTestCase(test, {
      prepare: [ 'Plug a monitor in the device\'s HDMI output' ],
      do: [ 'Reboot the device' ],
      assert: [
        'The Resin.io logo splash screen should be visible when the board initiates shutdown',
        'The Resin.io logo splash screen should be visible during boot-up'
      ]
    })
  })

  ava.test('supervisor: Identification LED', async (test) => {
    return utils.runManualTestCase(test, {
      do: [ 'Click the "Identify" button from the dashboard' ],
      assert: [ 'The device\'s identification LEDs should blink for a couple of seconds' ]
    })
  })

  ava.test('supervisor: Set environment variable when application is running', async (test) => {
    return utils.runManualTestCase(test, {
      prepare: [ 'Ensure the device is running an application' ],
      do: [
        'Set an environment variable',
        'Wait for a couple of seconds'
      ],
      assert: [
        'Ensure the device is running an application',
        'Open the Web Terminal, run `env`, and ensure the new env var is there'
      ],
      cleanup: [ 'Close the Web Terminal' ]
    })
  })

  ava.test('supervisor: Reboot while application is running', async (test) => {
    return utils.runManualTestCase(test, {
      prepare: [ 'Ensure the device is running an application' ],
      do: [
        'Reboot device',
        'Wait for a couple of minutes'
      ],
      assert: [
        'Ensure the device is online',
        'Ensure the device is running an application'
      ]
    })
  })

  ava.test('supervisor: Reload supervisor on a running device', async (test) => {
    return utils.runManualTestCase(test, {
      prepare: [
        'Ensure the device is online and running an application',
        'Logging into the device (ssh to the host OS)',
        'Check with "balena images" that the correct supervisor version is running on the device'
      ],
      do: [
        'Stop the supervisor by running `systemctl stop resin-supervisor` on the host OS',
        'Remove the supervisor container by running `balena rm resin_supervisor`',
        'Remove all supervisor images by running, i.e. `balena rmi -f $(balena images -q resin/{ARCH}-supervisor)`,',
        'replacing the image with the appropriate repository for the device',
        'Open the Web Terminal',
        'Execute `update-resin-supervisor`',
        'Re-open the Web Terminal after the supervisor is reloaded'
      ],
      assert: [
        'When you open the app container Web Terminal, it should not be accessible',
        'After running the supervisor update script, the Web Terminal should be accessible',
        'Execute `balena images`. It should list the same supervisor version the device started with',
        'Execute `balena ps`. It should resin_supervisor running'
      ]
    })
  })

  ava.test('resinhup: update device status with resin-device-progress', async (test) => {
    return utils.runManualTestCase(test, {
      do: [
        'Login to the host OS',
        'Update device status by running `resin-device-progress -p 60 -s "resinOS test"`'
      ],
      assert: [
        'The command runs successfully',
        'The device dashboard status is updated to show 60% and status message "resinOS test"'
      ]
    })
  })

  if (deviceTypeContract.connectivity.bluetooth) {
    ava.test('bluetooth: General bluetooth test', async (test) => {
      return utils.runManualTestCase(test, {
        prepare: [ 'Have an activated and visible Bluetooth device around you (i.e your phone\'s bluetooth)' ],
        do: [ 'Clone and push "https://github.com/resin-io-playground/test-bluetooth" to the device' ],
        assert: [ 'Check the device dashboard\'s logs. The last log message should be: TEST PASSED' ]
      })
    })
  }

  if (options.deviceType === 'beaglebone-black') {
    ava.test(`${options.deviceType}: Deactivate HDMI to use UART5`, async (test) => {
      return utils.runManualTestCase(test, {
        do: [
          'Download a new Beaglebone Black flasher image from the dashboard',
          'Append `fdtfile=am335x-boneblack-emmc-overlay.dtb` to `uEnv.txt_internal`',
          'Provision a new Beaglebone Black device using the above edited image',
          'Load the cape by running `echo BB-UART5 > /sys/devices/platform/bone_capemgr/slots` in the host OS'
        ],
        assert: [
          'The `uEnv.txt` file in the boot partition should contain `fdtfile=am335x-boneblack-emmc-overlay.dtb`',
          'Check that the UART5 is loaded by running `cat /sys/devices/platform/bone_capemgr/slots`',
          'Check that there are no HDMI conflict errors by running `dmesg | grep "could not request pin"`'
        ]
      })
    })
  }

  // TODO: These should be tested as provisioning variants
  // Allow the user to set image maker configuration options as env vars.
  if (options.deviceType === 'ts4900') {
    ava.test(`${options.deviceType}: Provision single model`, async (test) => {
      return utils.runManualTestCase(test, {
        do: [
          'Go into an existing ts4900 app or create a new one',
          'Select "single" as "CPU Cores"',
          'Select any "Network Connection" option',
          'Download the image and boot a single core variant of TS4900'
        ],
        assert: [ 'The device should successfully get provisioned and appear in dashboard' ]
      })
    })

    ava.test(`${options.deviceType}: Provision quad model`, async (test) => {
      return utils.runManualTestCase(test, {
        do: [
          'Go into an existing ts4900 app or create a new one',
          'Select "quad" as "CPU Cores"',
          'Select any "Network Connection" option',
          'Download the image and boot a single core variant of TS4900'
        ],
        assert: [ 'The device should successfully get provisioned and appear in dashboard' ]
      })
    })
  }

  // This applies only for rpi3 and rpi zero wifi
  if (options.deviceType === 'raspberrypi3' || options.deviceType === 'raspberrypi-pi') {
    ava.test(`${options.deviceType}: Enable serial port on UART0/ttyAMA0`, (test) => {
      return utils.runManualTestCase(test, {
        prepare: [
          'Set "console=serial0,115200" in /mnt/boot/cmdline.txt so that the kernel outputs logs to serial',
          'Make sure there are no "Device Configuration" variables configured'
        ],
        do: [
          'Run `minicom -b 115200 -o -D /dev/tty***`, replacing the tty device accordingly to your host',
          'Set `RESIN_HOST_CONFIG_dtoverlay=pi3-miniuart-bt` as a "Device Configuration" variable'
        ],
        assert: [
          'The device should reboot',
          'You should see booting messages on serial',
          '`getty` should be advertised as spawned on `ttyAMA0` with a login message like: Resin OS X.X raspberrypi3 ttyAMA0'
        ]
      })
    })
  }

  if (options.deviceType === 'raspberrypi3') {
    ava.test(`${options.deviceType}: Enable serial port on UART1/MiniUART/ttyS0`, (test) => {
      return utils.runManualTestCase(test, {
        prepare: [
          'Set "console=serial0,115200" in /mnt/boot/cmdline.txt so that the kernel outputs logs to serial',
          'Make sure there are no "Device Configuration" variables configured'
        ],
        do: [
          'Run `minicom -b 115200 -o -D /dev/tty***`, replacing the tty device accordingly to your host',
          'Set `RESIN_HOST_CONFIG_enable_uart=0` as a "Device Configuration" variable',
          'The device should reboot. Wait until its back online',
          'Set `RESIN_HOST_CONFIG_enable_uart=1` as a "Device Configuration" variable. The device should reboot',
          'The device should reboot. Wait until its back online'
        ],
        assert: [
          'No messages should be seen on the serial debug connection when setting `RESIN_HOST_CONFIG_enable_uart` to 0',
          'You should see the boot messages on the serial debug connection'
        ]
      })
    })
  }
}
