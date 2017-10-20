'use strict'

const fs = require('fs')

const configs = {
  ethernet: {
    network: 'ethernet'
  },
  wifi: {
    network: 'wifi',
    wifiSsid: 'resin_io',
    wifiKey: 'the spoon jumped over the moon'
  }
}

// Create our asset directory
if (!fs.existsSync(global.assetDir)) {
  fs.mkdirSync(global.assetDir)
}

const importSuite = (name, testPath, opt) => {
  describe(name, require(testPath)(opt).describe)
}

// Create dashboard application
// importSuite('Test Resin', './resin/application.js')
//

describe('Test ResinOS', function () {
  this.timeout(600000)

  importSuite(`Device provision via ${configs.ethernet.network}`, './resin/device.js', configs.ethernet)

  // TODO: importSuite(`Provision via ${configs.ethernet.wifi}`, './resin/device.js', configs.wifi)
  // TODO: importSuite('Container', './resin/container.js')
})
