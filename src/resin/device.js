'use strict'

module.exports = (opt) => {
  return {
    // eslint-disable-next-line prefer-arrow-callback
    describe: function () {
      const image = require('../lib/image')
      const device = global.resin.models.device

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

        return Promise.delay(10000)
          .return(global.options.appName)
          .then(device.getAllByApplication)
          .then((dev) => {
            global.expect(dev).to.have.length(1)
            global.expect(dev).to.be.instanceof(Array)
            return dev[0]
          })
          .then((dev) => {
            global.provDevice = dev
            return global.expect(dev).to.have.property('is_online', true)
          })
      })

      // eslint-disable-next-line prefer-arrow-callback
      it(`Device should report hostOS version: ${global.options.version}`, function () {
        return global.expect(global.provDevice.os_version).to.equal('Resin OS 2.0.6+rev3')
      })
    }
  }
}
