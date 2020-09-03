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
const utils = require('../lib/utils')

module.exports = {
  title: 'Build and push an out-of-tree kernel module (device specific test)',
  run: async (test, context, options, components) => {
    const clonePath = path.join(options.tmpdir, 'kernel-module-build')
    const hash = await utils.pushKernelModuleRepoToBalenaDevice({
      path: clonePath,
      url: 'https://github.com/balena-io-projects/kernel-module-build.git',
      uuid: context.uuid,
      key: context.key.privateKeyPath,
      balena: components.balena,
      applicationName: options.applicationName,
      balenaOSVersion: options.balenaOSVersion
    })

    test.is(await components.balena.sdk.getDeviceCommit(context.uuid), hash)

    const deviceLogs = await utils.getDeviceLogs({
      balena: components.balena,
      uuid: context.uuid
    })

    test.notMatch([ deviceLogs ], [ /insmod: ERROR/ ], 'Device logs shouldn\'t output "insmod: ERROR"')
    test.notMatch([ deviceLogs ], [ /rmmod: ERROR/ ], 'Device logs shouldn\'t output "rmmod: ERROR"')
    test.notMatch([ deviceLogs ], [ /could not load module/ ], 'Device logs shouldn\'t output "could not load module"')
    test.match([ deviceLogs ], [ /hello/ ], 'Device logs output "hello"')

    const dmesgDeviceLogs = await components.balena.sdk.executeCommandInHostOS(
      'dmesg -T',
      context.uuid,
      context.key.privateKeyPath
    )

    test.match([ dmesgDeviceLogs ], [ /Hello World!/ ], 'Dmesg logs output "Hello World!"')
  }
}
