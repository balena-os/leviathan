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
const imagefs = require('resin-image-fs')
const {
  join
} = require('path')

const utils = require('../../utils')

// TODO: This function should be implemented using Reconfix
const injectBalenaConfiguration = (image, configuration) => {
  return imagefs.writeFile({
    image,
    partition: 1,
    path: '/config.json'
  }, JSON.stringify(configuration))
}

// TODO: This function should be implemented using Reconfix
const injectNetworkConfiguration = (image, configuration) => {
  if (configuration.type === 'ethernet') {
    return Bluebird.resolve()
  }

  const wifiConfiguration = [
    '[connection]',
    'id=balena-wifi',
    'type=wifi',
    '[wifi]',
    'hidden=true',
    'mode=infrastructure',
    `ssid=${configuration.wifiSsid}`,
    '[ipv4]',
    'method=auto',
    '[ipv6]',
    'addr-gen-mode=stable-privacy',
    'method=auto'
  ]

  if (configuration.wifiKey) {
    Reflect.apply(wifiConfiguration.push, wifiConfiguration, [
      '[wifi-security]',
      'auth-alg=open',
      'key-mgmt=wpa-psk',
      `psk=${configuration.wifiKey}`
    ])
  }

  return imagefs.writeFile({
    image,
    partition: 1,
    path: '/system-connections/balena-wifi'
  }, wifiConfiguration.join('\n'))
}

module.exports = class BalenaOS {
  constructor (options = {}) {
    this.options = options
  }

  get image () {
    return join(this.options.tmpdir, 'balena.img')
  }

  async fetch () {
    if (this.options.configuration.balena) {
      console.log(`Downloading device type OS into ${this.image}`)
      await this.options.configuration.download.downloadDeviceTypeOS(this.options.deviceType, this.options.version, this.image)
    }
  }

  async configure () {
    console.log(`Configuring balenaOS image: ${this.image}`)

    if (this.options.configuration.balena) {
      await injectBalenaConfiguration(this.image, this.options.configuration.balena)
    }
    await injectNetworkConfiguration(this.image, this.options.configuration.network)
  }

  // eslint-disable-next-line class-methods-use-this
  async ssh (command, uuid, privateKeyPath) {
    const options = [ '-p 22222', `root@${uuid}` ]
    return utils.ssh(command, privateKeyPath, options)
  }
}
