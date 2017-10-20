'use strict'

module.exports = (opt) => {
  return {
    // eslint-disable-next-line prefer-arrow-callback
    describe: function () {
      const expect = global.expect
      const application = global.resin.models.application

      // eslint-disable-next-line prefer-arrow-callback
      before('Delete test application if it exists', function () {
        return application.remove(global.options.appName).catch((reason) => {
          if (reason.name !== 'ResinApplicationNotFound') {
            throw reason
          }
        })
      })

      // eslint-disable-next-line prefer-arrow-callback
      it(`Create test application (${global.options.appName})`, function () {
        return application.create(global.options.appName, global.options.deviceType)
          .then(() => {
            return application.get(global.options.appName)
          })
          .then((app) => {
            return expect(app.app_name).to.equal(global.options.appName)
          })
      })
    }
  }
}
