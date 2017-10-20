'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const sdk = require('../components/resinio/sdk')

module.exports = (opt) => {
  return {
    // eslint-disable-next-line prefer-arrow-callback
    describe: function () {
      // eslint-disable-next-line prefer-arrow-callback
      before('Delete test application if it exists', function () {
        return sdk.models.application.remove(global.options.appName).catch((reason) => {
          if (reason.name !== 'ResinApplicationNotFound') {
            throw reason
          }
        })
      })

      // eslint-disable-next-line prefer-arrow-callback
      it(`Create test application (${global.options.appName})`, function () {
        return sdk.models.application.create(global.options.appName, global.options.deviceType)
          .then(() => {
            return sdk.models.application.get(global.options.appName)
          })
          .then((app) => {
            return chai.expect(app.app_name).to.equal(global.options.appName)
          })
      })
    }
  }
}
