'use strict'

const fs = require('fs')
const path = require('path')
const Bluebird = require('bluebird')
const sdk = require('./components/resinio/sdk')
const resinos = require('./components/resinos/simple')
const etcher = require('./components/writer/etcher')
const os = require('os')

global.options = require(path.join(__dirname, '../user.json'))
global.assetDir = path.resolve(__dirname, '../assets')

global.provDevice = null

// Create asset directory
if (!fs.existsSync(global.assetDir)) {
  fs.mkdirSync(global.assetDir)
}

/* TODO: Re-enable
const importSuite = (name, testPath) => {
  describe(name, require(testPath)().describe)
}
*/

describe('Test ResinOS', function () {
  this.timeout(600000)

  // eslint-disable-next-line prefer-arrow-callback
  before(function () {
    this.imagePath = path.join(os.tmpdir(), 'resin.img')
    const configuration = {
      network: 'ethernet'
    }

    return sdk.loginWithToken(process.env.AUTH_TOKEN).then(() => {
      return sdk.hasApplication(process.env.APPLICATION_NAME)
    }).then((hasApplication) => {
      if (hasApplication) {
        return sdk.removeApplication(process.env.APPLICATION_NAME)
      }

      return Bluebird.resolve()
    }).then(() => {
      return sdk.createApplication(process.env.APPLICATION_NAME, global.options.deviceType)
    }).then(() => {
      return sdk.downloadDeviceTypeOS(global.options.deviceType, global.options.version, this.imagePath)
    }).then(() => {
      return sdk.getApplicationOSConfiguration(process.env.APPLICATION_NAME, configuration).then((applicationConfiguration) => {
        return resinos.injectResinConfiguration(this.imagePath, applicationConfiguration)
      })
    }).then(() => {
      return resinos.injectNetworkConfiguration(this.imagePath, configuration)
    }).then(() => {
      return etcher.writeImage(this.imagePath, global.options.disk)
    })
  })

  // TODO: importSuite(`Device`, './resin/device.js')
  // TODO: importSuite('Container', './resin/container.js')
})
