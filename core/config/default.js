const defer = require('config/defer').deferConfig;
const mapValues = require('lodash/mapValues');
const { join } = require('path');

module.exports = {
  express: {
    port: 80
  },
  worker: {
    url: 'http://127.0.0.1',
    port: 2000
  },
  leviathan: {
    artifacts: '/tmp/artifacts',
    downloads: '/tmp/downloads', // add an images directory in /tmp
    workdir: '/data',
    uploads: defer(function() {
      return mapValues({ image: 'os.img', config: 'config.json', suite: 'suite' }, value => {
        return join(this.leviathan.workdir, value);
      });
    })
  }
};
