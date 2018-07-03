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

const utils = require('../lib/utils')

module.exports = {
  title: 'Enable serial port on UART1/MiniUART/ttyS0',
  interactive: true,
  deviceType: {
    type: 'object',
    required: [ 'slug' ],
    properties: {
      slug: {
        type: 'string',
        const: 'raspberrypi3'
      }
    }
  },
  run: async (test, context, options) => {
    test.resolveMatch(utils.runManualTestCase({
      prepare: [
        'Logging into the device (ssh to the host OS)',
        'Set "console=serial0,115200" in "/mnt/boot/cmdline.txt" so that the kernel outputs logs to serial',
        'Plug in the USB serial cable into device, like this "https://elinux.org/RPi_Serial_Connection"',
        'Make sure there are no "Device Configuration" variables configured'
      ],
      do: [
        `Run "minicom -b 115200 -o -D ${options.serialConnection}"`,
        'Enable "RESIN_HOST_CONFIG_enable_uart" as a "Device Configuration" variable',
        'The device should reboot. Wait until it\'s back online',
        'Disable "RESIN_HOST_CONFIG_enable_uart" as a "Device Configuration" variable.',
        'The device should reboot. Wait until it\'s back online'
      ],
      assert: [
        'You should see the boot messages on the serial debug connection when enabling "RESIN_HOST_CONFIG_enable_uart"',
        'No messages should be seen on the serial debug connection when disabling "RESIN_HOST_CONFIG_enable_uart"'
      ],
      cleanup: [
        'Remove variable "RESIN_HOST_CONFIG_enable_uart" from "Device Configuration"',
        'Exit from minicom',
        'Close the Web HostOS Terminal'
      ]
    }), true)
    test.end()
  }
}
