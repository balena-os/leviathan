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
const Bluebird = require('bluebird')
const path = require('path')
const visuals = require('resin-cli-visuals')
const os = require('os')
const semver = require('resin-semver')

const fs = Bluebird.promisifyAll(require('fs'))
const keygen = Bluebird.promisify(require('ssh-keygen'))
const utils = require('../../utils')

module.exports = class BalenaSDK {
  constructor (apiUrl) {
    this.balena = require('balena-sdk')({
      apiUrl: `https://api.${apiUrl}`,
      imageMakerUrl: `https://img.${apiUrl}`
    })
  }

  async sshHostOS (command, uuid, privateKeyPath) {
    const VERSION_REQUIREMENT = '2.7.5'
    const options = [
      '-p 22',
      `${await this.balena.auth.whoami()}@ssh.${await this.balena.settings.get('proxyUrl')}`, `host -s ${uuid}`
    ]

    await utils.waitUntil(async () => {
      return await this.isDeviceOnline(uuid) && semver.gte(await this.getDeviceHostOSVersion(uuid), VERSION_REQUIREMENT)
    })

    return utils.ssh(command, privateKeyPath, options)
  }

  getAllSupportedOSVersions (deviceType) {
    return this.balena.models.os.getSupportedVersions(deviceType)
  }

  async downloadDeviceTypeOS (deviceType, version, destination) {
    const stream = await this.balena.models.os.download(deviceType, version)
    // eslint-disable-next-line no-underscore-dangle
    const filename = stream.response.headers._headers['content-disposition'][0].split('"')[1]
    const hardlink = path.join(path.dirname(destination), filename)

    if (!process.env.CI) {
      const bar = new visuals.Progress('Download')
      stream.on('progress', (data) => {
        bar.update({
          percentage: data.percentage,
          eta: data.eta
        })
      })
    }

    await new Bluebird((resolve, reject) => {
      const output = fs.createWriteStream(hardlink)
      output.on('error', reject)
      stream.on('error', reject)
      stream.on('finish', resolve)
      stream.pipe(output)
    })

    await fs.symlinkAsync(hardlink, destination)
  }

  getApplicationOSConfiguration (application, options) {
    return this.balena.models.os.getConfig(application, options)
  }

  async getDeviceOSConfiguration (uuid, apiKey, options) {
    const application = await this.balena.models.device.getApplicationName(uuid)
    const configuration = await this.getApplicationOSConfiguration(application, options)
    const device = await this.balena.models.device.get(uuid)

    configuration.registered_at = Math.floor(Date.now() / 1000)
    configuration.deviceId = device.id
    configuration.uuid = uuid
    configuration.deviceApiKey = apiKey
    return configuration
  }

  async getApplicationGitRemote (application) {
    const repo = (await this.balena.models.application.get(application).get('slug'))
    const config = await this.balena.models.config.getAll()
    const user = await this.balena.auth.whoami()
    return `${user}@${config.gitServerUrl}:${repo}.git`
  }

  loginWithToken (apiKey) {
    return this.balena.auth.loginWithToken(apiKey)
  }

  logout () {
    return this.balena.auth.logout()
  }

  hasApplication (application) {
    return this.balena.models.application.has(application)
  }

  removeApplication (application) {
    return this.hasApplication(application).then((hasApplication) => {
      if (hasApplication) {
        return this.balena.models.application.remove(application)
      }

      return Bluebird.resolve()
    })
  }

  createApplication (name, deviceType) {
    return this.balena.models.application.create({
      name, deviceType
    })
  }

  getApplicationDevices (application) {
    return this.balena.models.device.getAllByApplication(application).map((device) => {
      return device.id
    })
  }

  async createSSHKey (label) {
    const sshDir = path.join(os.homedir(), '.ssh')
    await fs.mkdirAsync(sshDir).catch({
      code: 'EEXIST'
    }, _.noop)

    const privateKeyPath = path.join(sshDir, 'id_rsa')
    const key = await keygen({
      location: privateKeyPath
    })

    await this.balena.models.key.create(label, key.pubKey)

    return {
      privateKey: key.key,
      publicKey: key.pubKey,
      privateKeyPath
    }
  }

  async removeSSHKey (label) {
    const keys = await this.balena.models.key.getAll()
    const key = _.find(keys, {
      title: label
    })

    if (key) {
      return this.balena.models.key.remove(key.id)
    }

    return Bluebird.resolve()
  }

  isDeviceOnline (device) {
    return this.balena.models.device.isOnline(device)
  }

  getDeviceHostOSVariant (device) {
    return this.balena.models.device.get(device).get('os_variant')
  }

  getDeviceHostOSVersion (device) {
    return this.balena.models.device.get(device).get('os_version')
  }

  getDeviceCommit (device) {
    return this.balena.models.device.get(device).get('is_on__commit')
  }

  getSupervisorVersion (device) {
    return this.balena.models.device.get(device).get('supervisor_version')
  }

  getDeviceStatus (device) {
    return this.balena.models.device.get(device).get('status')
  }

  getDeviceProvisioningState (device) {
    return this.balena.models.device.get(device).get('provisioning_state')
  }

  getDeviceProvisioningProgress (device) {
    return this.balena.models.device.get(device).get('provisioning_progress')
  }

  async getLastConnectedTime (device) {
    return new Date(await this.balena.models.device.get(device).get('last_connectivity_event'))
  }

  getDashboardUrl (device) {
    return this.balena.models.device.getDashboardUrl(device)
  }

  getApiUrl () {
    return this.balena.pine.API_URL
  }

  async createDevicePlaceholder (application) {
    const applicationId = await this.balena.models.application.get(application).get('id')
    const uuid = await this.balena.models.device.generateUniqueKey()
    const deviceApiKey = (await this.balena.models.device.register(applicationId, uuid)).api_key
    return {
      uuid,
      deviceApiKey
    }
  }

  setAppConfigVariable (application, key, value) {
    return this.balena.models.application.configVar.set(application, key, value)
  }

  async getAllServicesProperties (device, properties) {
    return _.flatMapDeep(await this.balena.models.device.getWithServiceDetails(device).get('current_services'),
      (services) => {
        return _.map(services, (service) => {
          if (properties.length === 1) {
            return service.properties[0]
          }

          return _.pick(service, properties)
        })
      }
    )
  }

  getEmail () {
    return this.balena.auth.getEmail()
  }

  pingSupervisor (device) {
    return this.balena.models.device.ping(device)
  }

  rebootDevice (device) {
    return this.balena.models.device.reboot(device, {force: true})
  }
}
