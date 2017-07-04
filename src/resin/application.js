'use strict';

module.exports = function (opt) {
    return {
            describe: function() {
            const expect = chai.expect;
            const application = resin.models.application;

            before('Delete test application if it exists', function() {
                return application.remove(options.appName)
                .catch(function (reason) {
                    if (reason.name != 'ResinApplicationNotFound') throw reason;
                });
            });

            it(`Create test application ( ${options.appName} )`, function() {
                return application.create(options.appName, options.deviceType)
                    .then(function() {
                        return application.get(options.appName);
                    })
                    .then(function(app) {
                        return expect(app.app_name).to.equal(options.appName);
                    });
            });
        }
    }
}
