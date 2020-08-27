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
const utils = require('../../lib/utils')

module.exports = {
  title: 'Push a mono-container to the application',
  run: async (test, context, options) => {
    const hash = await utils.pushAndWaitRepoToBalenaDevice({
      path: path.join(options.tmpdir, 'test'),
      url: 'https://github.com/balena-io-playground/x11-window-manager',
      uuid: context.balena.uuid,
      key: context.sshKeyPath,
      balena: context.balena,
      applicationName: options.applicationName
    })

    test.is(await context.balena.sdk.getDeviceCommit(context.balena.uuid), hash)

    test.is(await utils.runManualTestCase({
      prepare: [ 'Are you seeing a full desktop manager on the screen?' ]
    }), true)
  }
}
