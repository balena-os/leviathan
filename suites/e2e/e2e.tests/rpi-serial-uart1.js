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

module.exports = {
  title: 'Enable serial port on UART1/MiniUART/ttyS0',
  interactive: true,
  deviceType: {
    type: 'object',
    required: [ 'slug' ],
    properties: {
      slug: {
        type: 'string',
        anyOf: [
          {
            const: 'raspberrypi3'
          },
          {
            const: 'raspberry-pi'
          }
        ]
      }
    }
  },
  run: async function (context) {
    this.resolveMatch(context.utils.runManualTestCase({
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
    }), true)
  }
}
