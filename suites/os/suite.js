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
  run: async function() {
    const Worker = require(join(this.frameworkPath, 'common', 'worker'));
    const BalenaOS = require(join(
      this.frameworkPath,
      'components',
      'os',
      'balenaos',
    ));

    fse.ensureDirSync(this.options.tmpdir);

    this.globalContext = {
      utils: require(join(this.frameworkPath, 'common', 'utils')),
      sshKeyPath: join(homedir(), 'id'),
      link: `${this.options.balenaOS.config.uuid.slice(0, 7)}.local`,
      worker: new Worker(this.deviceType.slug),
    };

    this.teardown.register(() => {
      console.log('Worker teardown');
      return this.context.worker.teardown();
    });
    console.log('Setting up worker');
    await this.context.worker.select({
      type: this.options.worker.type,
      options: {
        network: {
          wireless: 'wlan0',
        },
      },
    });

    // Network definitions
    if (this.options.balenaOS.network.wired === true) {
      this.options.balenaOS.network.wired = {
        nat: true,
      };
    } else {
      delete this.options.balenaOS.network.wired;
    }
    if (this.options.balenaOS.network.wireless === true) {
      this.options.balenaOS.network.wireless = {
        ssid: this.options.id,
        psk: `${this.options.id}_psk`,
        nat: true,
      };
    } else {
      delete this.options.balenaOS.network.wireless;
    }
    await this.context.worker.network(this.options.balenaOS.network);

    this.globalContext = {
      os: new BalenaOS({
        deviceType: this.deviceType.slug,
        network: this.options.balenaOS.network,
        configJson: {
          uuid: this.options.balenaOS.config.uuid,
          os: {
            sshKeys: [
              await this.context.utils.createSSHKey(this.context.sshKeyPath),
            ],
          },
          // persistentLogging is managed by the supervisor and only read at first boot
          persistentLogging: true,
        },
      }),
    };

    await this.context.os.fetch(this.options.packdir, {
      type: this.options.balenaOS.download.type,
      version: this.options.balenaOS.download.version,
    });
    await this.context.worker.flash(this.context.os);
    await this.context.worker.on();

    console.log('Waiting for device to be reachable');
    assert.equal(
      await this.context.worker.executeCommandInHostOS(
        'cat /etc/hostname',
        this.context.link,
      ),
      this.context.link.split('.')[0],
      'Device should be reachable',
    );
  },
  tests: [
    './tests/i-boot-splash',
    './tests/connectivity',
    './tests/config-json',
  ],
};
