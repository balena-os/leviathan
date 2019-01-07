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

module.exports = {
  title: 'Update device status with resin-device-progress',
  run: async function (context) {
    await context.balena.sdk.executeCommandInHostOS('resin-device-progress -p 60 -s "balenaOS test"',
      context.balena.uuid
    )

    await context.utils.waitUntil(async () => {
      return !_.isEmpty(await context.balena.sdk.getDeviceProvisioningState(context.balena.uuid))
    })

    this.resolveMatch(context.balena.sdk.getDeviceProvisioningState(context.balena.uuid), 'balenaOS test')
    this.resolveMatch(context.balena.sdk.getDeviceProvisioningProgress(context.balena.uuid), 60)
  }
}
