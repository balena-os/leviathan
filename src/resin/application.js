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
        return sdk.models.application.remove(process.env.APPLICATION_NAME).catch((reason) => {
          if (reason.name !== 'ResinApplicationNotFound') {
            throw reason
          }
        })
      })

      // eslint-disable-next-line prefer-arrow-callback
      it(`Create test application (${process.env.APPLICATION_NAME})`, function () {
        return sdk.models.application.create(process.env.APPLICATION_NAME, global.options.deviceType)
          .then(() => {
            return sdk.models.application.get(process.env.APPLICATION_NAME)
          })
          .then((app) => {
            return chai.expect(app.app_name).to.equal(process.env.APPLICATION_NAME)
          })
      })
    }
  }
}
