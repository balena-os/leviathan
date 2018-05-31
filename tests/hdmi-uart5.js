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
  title: 'Deactivate HDMI to use UART5',
  interactive: true,
  deviceType: {
    type: 'object',
    required: [ 'slug' ],
    properties: {
      slug: {
        type: 'string',
        const: 'beaglebone-black'
      }
    }
  },
  run: async (test, context, options) => {
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
  }
}
