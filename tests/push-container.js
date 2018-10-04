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

const _ = require('lodash')
const path = require('path')
const utils = require('../lib/utils')

module.exports = {
  title: 'Push a mono-container to the application',
  run: async (test, context, options, components) => {
    const clonePath = path.join(options.tmpdir, 'test')
    await utils.cloneRepo({
      path: clonePath,
      url: 'https://github.com/resin-io-projects/resin-cpp-hello-world.git'
    })
    const hash = await utils.pushRepo(context.key.privateKeyPath, {
      repo: {
        remote: {
          name: 'resin',
          url: await components.resinio.getApplicationGitRemote(options.applicationName)
        },
        branch: {
          name: 'master'
        },
        path: clonePath
      }
    })

    await utils.waitProgressCompletion(async () => {
      return components.resinio.getAllServicesProperties(context.uuid, 'download_progress')
    }, async () => {
      const services = await components.resinio.getAllServicesProperties(context.uuid, [ 'status', 'commit' ])

      if (_.isEmpty(services)) {
        return false
      }

      return _.every(services, {
        status: 'Running',
        commit: hash
      })
    })

    test.resolveMatch(components.resinio.getDeviceCommit(context.uuid), hash)
  }
}
