'use strict';

module.exports = function (opt) {
    return {
        describe: function() {
            const image = require('../lib/image');
            const device = resin.models.device

            before (function() {
                return image.provision(options.appName, options.deviceType, options.version, options.disk, opt);
            });

            it('Device should become online', function(){
                this.retries(50);

                return Promise.delay(10000)
                    .return(options.appName)
                    .then(device.getAllByApplication)
                    .then(function (dev) {
                        expect(dev).to.have.length(1);
                        expect(dev).to.be.instanceof(Array);
                        return dev[0];
                    })
                    .then(function (d) {
                        provDevice = d;
                        return expect(d).to.have.property('is_online', true);
                    });
            });

            it(`Device should report hostOS version: ${options.version}`, function() {
                //XX
                return expect(provDevice.os_version).to.equal('Resin OS 2.0.6+rev3');
            });
        }
    }
}
