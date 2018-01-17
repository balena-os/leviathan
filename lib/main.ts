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

import ava = require('ava')
import fse = require('fs-extra')
import path = require('path')

// Simple-git typing is out of date, ignore it for now
const git: any = require('simple-git/promise')

const TEMPORARY_DIRECTORY = path.join(__dirname, '..', '.tmp')
fse.ensureDirSync(TEMPORARY_DIRECTORY)

const options = <any>{
  deviceType: process.env.RESINOS_TESTS_DEVICE_TYPE,
  resinOSVersion: process.env.RESINOS_TESTS_RESINOS_VERSION,
  applicationName: process.env.RESINOS_TESTS_APPLICATION_NAME,
  disk: process.env.RESINOS_TESTS_DISK,
  email: process.env.RESINOS_TESTS_EMAIL,
  password: process.env.RESINOS_TESTS_PASSWORD
}

const utils = require('./utils')
const resinio = utils.requireComponent('resinio', 'sdk')
const resinos = utils.requireComponent('resinos', 'default')
const writer = utils.requireComponent('writer', 'etcher')
const deviceType = utils.requireComponent('device-type', options.deviceType)

const context: any = {
  uuid: null,
  key: null
}

ava.test.before(async () => {
  const imagePath = path.join(TEMPORARY_DIRECTORY, 'resin.img')
  const configuration = {
    network: 'ethernet'
  }

  options.resinOSVersion = await utils.resolveVersionSelector(await resinio.getAllSupportedOSVersions(options.deviceType), options.resinOSVersion)

  console.log('Logging into resin.io')
  await resinio.loginWithCredentials({
    email: options.email,
    password: options.password
  })

  console.log(`Removing application: ${options.applicationName}`)
  await resinio.removeApplication(options.applicationName)

  console.log(`Creating application: ${options.applicationName} with device type ${options.deviceType}`)
  await resinio.createApplication(options.applicationName, options.deviceType)

  console.log('Remove previous SSH keys')
  await resinio.removeSSHKeys()
  context.key = await resinio.createSSHKey()
  console.log(`Add new SSH key: ${context.key.publicKey}`)

  console.log(`Downloading device type OS into ${imagePath}`)
  await resinio.downloadDeviceTypeOS(options.deviceType, options.resinOSVersion, imagePath)

  console.log(`Creating device placeholder on ${options.applicationName}`)
  const placeholder = await resinio.createDevicePlaceholder(options.applicationName)

  console.log(`Getting resin.io configuration for device ${placeholder.uuid}`)
  const resinConfiguration = await resinio.getDeviceOSConfiguration(placeholder.uuid, placeholder.deviceApiKey, configuration)

  console.log(`Injecting resin.io configuration into ${imagePath}`)
  await resinos.injectResinConfiguration(imagePath, resinConfiguration)

  console.log(`Injecting network configuration into ${imagePath}`)
  await resinos.injectNetworkConfiguration(imagePath, configuration)

  console.log(`Provisioning ${options.disk} with ${imagePath}`)
  await deviceType.provision(imagePath, writer, {
    destination: options.disk
  })

  console.log(`Waiting while device boots`)
  await utils.waitUntil(async () => await resinio.isDeviceOnline(placeholder.uuid))

  console.log('Done, running tests')
  context.uuid = placeholder.uuid
})

ava.test.serial('device should become online', async (test) => {
  const isOnline = await resinio.isDeviceOnline(context.uuid)
  test.true(isOnline)
})

ava.test.skip('device should report hostOS version', async (test) => {
  const version = await resinio.getDeviceHostOSVersion(context.uuid)
  test.is(version, 'Resin OS 2.0.6+rev3')
})

ava.test.serial('should push an application', async (test) => {
  const GIT_SSH_COMMAND = `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i ${context.key.privateKeyPath}`
  const remote = 'resin'
  const repositoryPath = path.join(TEMPORARY_DIRECTORY, 'test')
  const gitUrl = await resinio.getApplicationGitRemote(options.applicationName)

  await fse.remove(repositoryPath)
  await git().clone('https://github.com/resin-io-projects/resin-cpp-hello-world.git', repositoryPath)
  await git(repositoryPath).addRemote(remote, gitUrl)
  await git(repositoryPath).env('GIT_SSH_COMMAND', GIT_SSH_COMMAND).push(remote, 'master')

  await utils.waitUntil(async () => await resinio.getDeviceStatus(context.uuid) === 'Downloading')
  await utils.waitUntil(async () => await resinio.getDeviceStatus(context.uuid) === 'Idle')

  const commit = await resinio.getDeviceCommit(context.uuid)
  test.is(commit.length, 40)
})
