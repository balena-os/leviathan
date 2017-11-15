'use strict'

const Bluebird = require('bluebird')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const sdk = require('../components/resinio/sdk')

module.exports = () => {
  return {
    // eslint-disable-next-line prefer-arrow-callback
    describe: function () {
      // eslint-disable-next-line prefer-arrow-callback
      it('Device should become online', function () {
        this.retries(50)

        return Bluebird.delay(10000)
          .return(process.env.APPLICATION_NAME)
          .then(sdk.getApplicationDevices)
          .then((devices) => {
            chai.expect(devices).to.have.length(1)
            chai.expect(devices).to.be.instanceof(Array)
            return devices[0]
          })
          .then((device) => {
            global.provDevice = device.id
            return sdk.isDeviceOnline(device)
          }).then((isOnline) => {
            return chai.expect(isOnline).to.be.true
          })
      })

      // eslint-disable-next-line prefer-arrow-callback
      it(`Device should report hostOS version: ${global.options.version}`, function () {
        return sdk.getDeviceHostOSVersion(global.provDevice).then((version) => {
          return chai.expect(version).to.equal('Resin OS 2.0.6+rev3')
        })
      })
    }
  }
}
