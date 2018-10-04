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

const path = require('path')
const fse = require('fs-extra')
const git = require('simple-git/promise')
const utils = require('../lib/utils')

module.exports = {
  title: 'Push a mono-container to the application',
  run: async (test, context, options, components) => {
    const GIT_SSH_COMMAND = `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i ${context.key.privateKeyPath}`
    const remote = 'resin'
    const repositoryPath = path.join(options.tmpdir, 'test')
    options.gitUrl = await components.resinio.getApplicationGitRemote(options.applicationName)

    await fse.remove(repositoryPath)
    await git().clone('https://github.com/resin-io-projects/resin-cpp-hello-world.git', repositoryPath)
    await git(repositoryPath).addRemote(remote, options.gitUrl)
    await git(repositoryPath).env('GIT_SSH_COMMAND', GIT_SSH_COMMAND).push(remote, 'master')

    await utils.waitUntil(async () => {
      return await components.resinio.getDeviceCommit(context.uuid) !== null
    })

    const commit = await components.resinio.getDeviceCommit(context.uuid)
    test.is(commit.length, 40)
  }
}
