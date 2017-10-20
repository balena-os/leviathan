'use strict'

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
if (!global.fs.existsSync(global.assetDir)) {
  global.fs.mkdirSync(global.assetDir)
}

// Create dashboard application
// importSuite('Test Resin', './resin/application.js')

describe('Test ResinOS', function () {
  this.timeout(600000)

  global.importSuite(`Device provision via ${configs.ethernet.network}`, './resin/device.js', configs.ethernet)

  // TODO: global.importSuite(`Provision via ${configs.ethernet.wifi}`, './resin/device.js', configs.wifi)
  // TODO: global.importSuite('Container', './resin/container.js')
})
