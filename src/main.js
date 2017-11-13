'use strict'

const fs = require('fs')
const path = require('path')

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

const importSuite = (name, testPath, opt) => {
  describe(name, require(testPath)(opt).describe)
}

describe('Preparing test environment', function () {
  this.timeout(900000)

  console.log(process.env.foo)
  importSuite('Authenticate user using token', './resin/auth.js')
  importSuite('Create application', './resin/application.js')
})

describe('Test ResinOS', function () {
  this.timeout(600000)

  // TODO: importSuite(`Device provision via ${configs.ethernet.network}`, './resin/device.js', configs.ethernet)

  // TODO: importSuite(`Provision via ${configs.ethernet.wifi}`, './resin/device.js', configs.wifi)
  // TODO: importSuite('Container', './resin/container.js')
})
