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

const Bluebird = require('bluebird')
const realpath = Bluebird.promisify(require('fs').realpath)

const {
  basename
} = require('path')

module.exports = {
  title: 'Image filename format',
  run: async (test, context, options, components) => {
    const supervisorVersion = await components.balena.getSupervisorVersion(context.uuid)
    const hostOsVersion = (await components.balena.getDeviceHostOSVersion(context.uuid)).split(' ')
    const filename = basename(await realpath(context.os.image))

    // BalenaOS is yet to rename
    // const apiUrl = (await components.balena.getApiUrl()).split('.')
    // test.is(filename, `${apiUrl[1]}-${options.deviceType}-${hostOsVersion[2]}-v${supervisorVersion}.img`)

    test.is(filename, `resin-${options.deviceType}-${hostOsVersion[1]}-v${supervisorVersion}.img`)
  }
}
