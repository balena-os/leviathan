'use strict'

const fs = require('fs')
const path = require('path')
const Bluebird = require('bluebird')
const resinio = require('./components/resinio/sdk')
const resinos = require('./components/resinos/simple')
const writer = require('./components/writer/etcher')
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
    const applicationName = process.env.APPLICATION_NAME
    const configuration = {
      network: 'ethernet'
    }

    return resinio.loginWithToken(process.env.AUTH_TOKEN).then(() => {
      return resinio.hasApplication(applicationName)
    }).then((hasApplication) => {
      if (hasApplication) {
        return resinio.removeApplication(applicationName)
      }

      return Bluebird.resolve()
    }).then(() => {
      return resinio.createApplication(applicationName, global.options.deviceType)
    }).then(() => {
      return resinio.downloadDeviceTypeOS(global.options.deviceType, global.options.version, this.imagePath)
    }).then(() => {
      return resinio.getApplicationOSConfiguration(applicationName, configuration).then((applicationConfiguration) => {
        return resinos.injectResinConfiguration(this.imagePath, applicationConfiguration)
      })
    }).then(() => {
      return resinos.injectNetworkConfiguration(this.imagePath, configuration)
    }).then(() => {
      return writer.writeImage(this.imagePath, global.options.disk)
    })
  })

  // TODO: importSuite(`Device`, './resin/device.js')
  // TODO: importSuite('Container', './resin/container.js')
})
