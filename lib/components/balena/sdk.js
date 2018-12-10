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
const net = require('net')
const retry = require('bluebird-retry')

const fs = Bluebird.promisifyAll(require('fs'))
const keygen = Bluebird.promisify(require('ssh-keygen'))

const utils = require('../../utils')

module.exports = class BalenaSDK {
  constructor (apiUrl) {
    this.balena = require('balena-sdk')({
      apiUrl: `https://api.${apiUrl}`,
      imageMakerUrl: `https://img.${apiUrl}`
    })

    this.pine = this.balena.pine
  }

  async executeCommandInHostOS (command, device, privateKeyPath,
    timeout = {
      interval: 10000,
      tries: 60
    }
  ) {
    const connection = {
      sshPort: 22,
      vpnTunnelPort: 3128,
      dropbearPort: 22222
    }

    return retry(async () => {
      if (!await this.isDeviceConnectedToVpn(device)) {
        throw new Error(`${device}: is not marked as connected to our VPN.`)
      }

      const result = await utils.executeCommandOverSSH(`host -s ${device} source /etc/profile ; ${command}`,
        {
          host: `ssh.${await this.balena.settings.get('proxyUrl')}`,
          username: await this.balena.auth.whoami(),
          port: connection.sshPort,
          privateKey: privateKeyPath
        }, {
          socket: net.connect(connection.vpnTunnelPort, await this.getVpnInstaceIp(device)),
          host: `${device}.balena`,
          port: connection.dropbearPort,
          proxyAuth: await this.balena.auth.getToken()
        })

      if (result.code !== 0) {
        throw new Error(`"${command}" failed. stderr: ${result.stderr}, stdout: ${result.stdout}, code: ${result.code}`)
      }

      return result.stdout
    }, {
      max_tries: timeout.tries,
      interval: timeout.interval,
      throw_original: true
    })
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

  isDeviceConnectedToVpn (device) {
    return this.balena.models.device.get(device).get('is_connected_to_vpn')
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

  getApplicationCommit (application) {
    return this.balena.models.application.get(application).get('commit')
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
            return service[properties[0]]
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

  async getVpnInstaceIp (device) {
    const response = await this.pine.get({
      resource: 'service_instance',
      options: {
        $select: 'ip_address',
        $filter: {
          manages__device: {
            $any: {
              $alias: 'result',
              $expr: {
                result: {
                  uuid: device
                }
              }
            }
          }
        }
      }
    })

    if (response.length !== 1) {
      throw new Error(`Could not find VPN instance for: ${device}`)
    }

    return response[0].ip_address
  }

  enableDeviceUrl (device) {
    return this.balena.models.device.enableDeviceUrl(device)
  }

  disableDeviceUrl (device) {
    return this.balena.models.device.disableDeviceUrl(device)
  }

  getDeviceUrl (device) {
    return this.balena.models.device.getDeviceUrl(device)
  }

  moveDeviceToApplication (device, application) {
    return this.balena.models.device.move(device, application)
  }
}
