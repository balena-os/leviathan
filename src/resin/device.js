'use strict'

const Bluebird = require('bluebird')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const image = require('../lib/image')
const sdk = require('../components/resinio/sdk')

module.exports = (opt) => {
  return {
    // eslint-disable-next-line prefer-arrow-callback
    describe: function () {
      // eslint-disable-next-line prefer-arrow-callback
      before(function () {
        return image.provision(
          global.options.appName,
          global.options.deviceType,
          global.options.version,
          global.options.disk,
          opt)
      })

      // eslint-disable-next-line prefer-arrow-callback
      it('Device should become online', function () {
        this.retries(50)

        return Bluebird.delay(10000)
          .return(global.options.appName)
          .then(sdk.models.device.getAllByApplication)
          .then((dev) => {
            chai.expect(dev).to.have.length(1)
            chai.expect(dev).to.be.instanceof(Array)
            return dev[0]
          })
          .then((dev) => {
            global.provDevice = dev
            return chai.expect(dev).to.have.property('is_online', true)
          })
      })

      // eslint-disable-next-line prefer-arrow-callback
      it(`Device should report hostOS version: ${global.options.version}`, function () {
        return chai.expect(global.provDevice.os_version).to.equal('Resin OS 2.0.6+rev3')
      })
    }
  }
}
