/*
 * Copyright 2018 balena
 *
 * @license Apache-2.0
 */

'use strict';

const assert = require('assert');
const fse = require('fs-extra');
const { join } = require('path');
const { homedir } = require('os');

module.exports = {
  title: 'BalenaOS release suite',
  run: async function(test) {
    const Worker = require(join(this.frameworkPath, 'common', 'worker'));
    const BalenaOS = require(join(this.frameworkPath, 'components', 'os', 'balenaos'));

    this.globalContext = { utils: require(join(this.frameworkPath, 'common', 'utils')) };

    fse.ensureDirSync(this.options.tmpdir);

    this.globalContext = { sshKeyPath: join(homedir(), 'id') };

    const config = {
      uuid: this.options.balenaOS.config.uuid,
      os: {
        sskKeys: [
          this.options.balenaOS.config.pubKey != null
            ? this.options.balenaOS.config.pubKey
            : await this.context.utils.createSSHKey(this.context.sshKeyPath)
        ]
      }
    };

    this.globalContext = {
      link: `${config.uuid.slice(0, 7)}.local`
    };

    this.globalContext = {
      worker: new Worker(this.deviceType.slug, this.options.worker.url)
    };

    this.globalContext = {
      os: new BalenaOS({
        deviceType: this.deviceType.slug,
        network: this.options.balenaOS.network
      })
    };

    // Device Provision with preloaded application
    await this.context.os.fetch(this.options.tmpdir, {
      type: this.options.balenaOS.download.type,
      version: this.options.balenaOS.download.version,
      source: this.options.balenaOS.download.source
    });

    this.context.os.addCloudConfig(config);

    console.log('Setting up worker');
    await this.context.worker.select({
      type: this.options.worker.type
    });
    await this.context.worker.network({
      wired: {
        nat: true
      }
    });
    await this.context.worker.flash(this.context.os);
    await this.context.worker.on();
    this.teardown.register(() => {
      return this.context.worker.off();
    });

    console.log('Waiting for device to be reachable');
    assert.equal(
      await this.context.worker.executeCommandInHostOS('cat /etc/hostname', this.context.link),
      this.context.link.split('.')[0],
      'Device should be reachable'
    );
  },
  tests: ['./tests/i-boot-splash', './tests/connectivity', './tests/config-json']
};
