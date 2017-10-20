'use strict'

global.resin = require('resin-sdk')({
  apiUrl: 'https://api.resin.io/'
})

global.fs = require('fs')
global.path = require('path')

const chaiAsPromised = require('chai-as-promised')
global.chai = require('chai')
global.chai.use(chaiAsPromised)
global.expect = global.chai.expect

global.Promise = require('bluebird')

global.options = JSON.parse(global.fs.readFileSync('./user.json', 'utf8'))

global.rootDir = global.path.resolve(__dirname)
global.assetDir = global.path.resolve(global.rootDir, '../assets')

global.provDevice = null

// This will come from the device repo
global.options.deviceType = 'raspberrypi3'
global.options.version = 'latest'

global.importSuite = (name, path, opt) => {
  describe(name, require(path)(opt).describe)
}
