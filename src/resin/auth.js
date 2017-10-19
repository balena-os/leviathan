'use strict'

const sdk = require('../components/resinio/sdk')

module.exports = function (opt) {
  return {
    describe: function () {
      it('User authenticated', function () {
        return sdk.auth.loginWithToken(process.env.AUTH_TOKEN)
      })
    }
  }
}
