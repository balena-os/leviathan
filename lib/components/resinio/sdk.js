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

const Bluebird = require('bluebird')
const path = require('path')
const visuals = require('resin-cli-visuals')
const os = require('os')

const fs = Bluebird.promisifyAll(require('fs'))
const keygen = Bluebird.promisify(require('ssh-keygen'))
const utils = require('../../utils')

module.exports = class ResinSDK {
  constructor (api) {
    this.resin = require('resin-sdk')({
      apiUrl: api
    })
  }

  async sshHostOS (command, uuid, privateKeyPath) {
    const SSH_HOST = 'ssh.resindevice.io'
    const options = [ '-p 22', `${await this.resin.auth.whoami()}@${SSH_HOST}`, `host ${uuid}` ]
    return utils.ssh(command, privateKeyPath, options)
  }

  getAllSupportedOSVersions (deviceType) {
    return this.resin.models.os.getSupportedVersions(deviceType).get('versions')
  }

  async downloadDeviceTypeOS (deviceType, version, destination) {
    const stream = await this.resin.models.os.download(deviceType, version)
    if (!process.env.CI) {
      const bar = new visuals.Progress('Download')
      stream.on('progress', (data) => {
        bar.update({
          percentage: data.percentage,
          eta: data.eta
        })
      })
    }

    return new Bluebird((resolve, reject) => {
      const output = fs.createWriteStream(destination)
      output.on('error', reject)
      stream.on('error', reject)
      stream.on('finish', resolve)
      stream.pipe(output)
    })
  }

  getApplicationOSConfiguration (application, options) {
    return this.resin.models.os.getConfig(application, options)
  }

  async getDeviceOSConfiguration (uuid, apiKey, options) {
    const application = await this.resin.models.device.getApplicationName(uuid)
    const configuration = await this.getApplicationOSConfiguration(application, options)
    const device = await this.resin.models.device.get(uuid)

    configuration.registered_at = Math.floor(Date.now() / 1000)
    configuration.deviceId = device.id
    configuration.uuid = uuid
    configuration.deviceApiKey = apiKey
    return configuration
  }

  async getApplicationGitRemote (application) {
    const repo = (await this.resin.models.application.get(application).get('git_repository'))
    const config = await this.resin.models.config.getAll()
    const user = await this.resin.auth.whoami()
    return `${user}@${config.gitServerUrl}:${repo}.git`
  }

  loginWithCredentials (credentials) {
    return this.resin.auth.login(credentials)
  }

  logout () {
    return this.resin.auth.logout()
  }

  hasApplication (application) {
    return this.resin.models.application.has(application)
  }

  removeApplication (application) {
    return this.hasApplication(application).then((hasApplication) => {
      if (hasApplication) {
        return this.resin.models.application.remove(application)
      }

      return Bluebird.resolve()
    })
  }

  createApplication (name, deviceType) {
    return this.resin.models.application.create(name, deviceType)
  }

  getApplicationDevices (application) {
    return this.resin.models.device.getAllByApplication(application).map((device) => {
      return device.id
    })
  }

  async createSSHKey () {
    const sshDir = path.join(os.homedir(), '.ssh')
    await fs.mkdirAsync(sshDir).catch({
      code: 'EEXIST'
    }, this.noop)

    const privateKeyPath = path.join(sshDir, 'id_rsa')
    const key = await keygen({
      location: privateKeyPath
    })

    await this.resin.models.key.create('resinOSTests', key.pubKey)

    return {
      privateKey: key.key,
      publicKey: key.pubKey,
      privateKeyPath
    }
  }

  removeSSHKeys () {
    return this.resin.models.key.getAll().each((key) => {
      return this.resin.models.key.remove(key.id)
    })
  }

  isDeviceOnline (device) {
    return this.resin.models.device.isOnline(device)
  }

  getDeviceHostOSVersion (device) {
    return this.resin.models.device.get(device).get('os_version')
  }

  getDeviceCommit (device) {
    return this.resin.models.device.get(device).get('is_on__commit')
  }

  async createDevicePlaceholder (application) {
    const applicationId = await this.resin.models.application.get(application).get('id')
    const uuid = await this.resin.models.device.generateUniqueKey()
    const deviceApiKey = await this.resin.models.device.generateUniqueKey()
    await this.resin.models.device.register(applicationId, uuid, deviceApiKey)
    return {
      uuid,
      deviceApiKey
    }
  }

  getDeviceStatus (device) {
    return this.resin.models.device.get(device).get('status')
  }
}
