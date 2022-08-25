const defer = require('config/defer').deferConfig;
const mapValues = require('lodash/mapValues');
const { join } = require('path');

module.exports = {
  leviathan: {
    artifacts: '/tmp/artifacts',    // To store artifacts meant to be reported as results at the end of the suite
    downloads: '/data/downloads',   // To store/download assets needed for the suite (non-persistent) 
    reports: '/reports/',           // To store/download reports generated from the suite (non-persistent) 
    workdir: '/data',
    uploads: defer(function() {
      return mapValues({ image: 'os.img', config: 'config.json', suite: 'suite' }, value => {
        return join(this.leviathan.workdir, value);
      });
    })
  }
};
