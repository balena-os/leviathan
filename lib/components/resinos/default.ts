'use strict'

import Bluebird = require('bluebird')
import imagefs = require('resin-image-fs')

// TODO: This function should be implemented using Reconfix
exports.injectResinConfiguration = (image, configuration) => {
  return imagefs.writeFile({
    image,
    partition: 1,
    path: '/config.json'
  }, JSON.stringify(configuration))
}

// TODO: This function should be implemented using Reconfix
exports.injectNetworkConfiguration = (image, configuration) => {
  if (configuration.network === 'ethernet') {
    return Bluebird.resolve()
  }

  const wifiConfiguration = [
    '[connection]',
    'id=resin-wifi',
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
    path: '/system-connections/resin-wifi'
  }, wifiConfiguration)
}
