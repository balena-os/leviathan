'use strict';

global.resin = require('resin-sdk')({
    apiUrl: "https://api.resin.io/"
});

global.fs = require('fs');
global.path = require('path');

const chaiAsPromised = require('chai-as-promised');
global.chai = require('chai');
global.chai.use(chaiAsPromised);
global.expect = chai.expect;

global.Promise = require("bluebird");

global.options = JSON.parse(fs.readFileSync('./user.json', 'utf8'));

global.rootDir = path.resolve(__dirname);
global.assetDir = path.resolve(rootDir, '../assets');

global.provDevice;

//This will come from the device repo
global.options.deviceType = 'raspberrypi3'
global.options.version = 'latest'

global.importSuite = (name, path, opt) => {
    describe(name, require(path)(opt).describe);
}
