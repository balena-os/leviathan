'use strict'

const fs = require('fs')
const path = require('path')
const Bluebird = require('bluebird')
const sdk = require('./components/resinio/sdk')

global.options = require(path.join(__dirname, '../user.json'))
global.assetDir = path.resolve(__dirname, '../assets')

global.provDevice = null

/* TODO: Re-enable
const configs = {
  ethernet: {
    network: 'ethernet'
  },
  wifi: {
    network: 'wifi',
    wifiSsid: process.env.WIFI_SSID,
    wifiKey: process.env.WIFI_KEY
  }
}
*/

// Create asset directory
if (!fs.existsSync(global.assetDir)) {
  fs.mkdirSync(global.assetDir)
}

/* TODO: Re-enable
const importSuite = (name, testPath, opt) => {
  describe(name, require(testPath)(opt).describe)
}
*/

describe('Test ResinOS', function () {
  this.timeout(600000)

  // eslint-disable-next-line prefer-arrow-callback
  before(function () {
    return sdk.loginWithToken(process.env.AUTH_TOKEN)
      .then(() => {
        return sdk.hasApplication(process.env.APPLICATION_NAME)
      })
      .then((hasApplication) => {
        if (hasApplication) {
          return sdk.removeApplication(process.env.APPLICATION_NAME)
        }

        return Bluebird.resolve()
      })
      .then(() => {
        return sdk.createApplication(process.env.APPLICATION_NAME, global.options.deviceType)
      })
  })

  // TODO: importSuite(`Device provision via ${configs.ethernet.network}`, './resin/device.js', configs.ethernet)

  // TODO: importSuite(`Provision via ${configs.ethernet.wifi}`, './resin/device.js', configs.wifi)
  // TODO: importSuite('Container', './resin/container.js')
})
