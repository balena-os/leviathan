/*
 * Copyright 2018 balena
 *
 * @license Apache-2.0
 */

'use strict';

const assert = require('assert');
const noop = require('lodash/noop');
const Bluebird = require('bluebird');
const fse = require('fs-extra');
const { join } = require('path');
const { homedir } = require('os');

module.exports = {
  title: 'BalenaOS release suite',
  run: async function() {
    const Worker = this.require('common/worker');
    const BalenaOS = this.require('components/os/balenaos');
    const Balena = this.require('components/balena/sdk');
    const CLI = this.require('components/balena/cli');
    const DeviceApplication = this.require('components/balena/utils');

    await fse.ensureDir(this.options.tmpdir);

    this.globalContext = {
      balena: {
        application: { name: this.options.id },
        deviceApplicationChain: new DeviceApplication().getChain(),
        sdk: new Balena(this.options.balena.apiUrl),
        sshKey: { label: this.options.id },
      },
      sshKeyPath: join(homedir(), 'id'),
      utils: this.require('common/utils'),
      worker: new Worker(this.deviceType.slug, this.options.worker.url),
    };

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

    this.globalContext = {
      os: new BalenaOS({
        deviceType: this.deviceType.slug,
        network: this.options.balenaOS.network,
      }),
    };

    await this.context.balena.sdk.loginWithToken(this.options.balena.apiKey);
    this.teardown.register(() => {
      return this.context.balena.sdk.logout().catch(
        {
          code: 'BalenaNotLoggedIn',
        },
        noop,
      );
    });

    await this.context.balena.sdk.createApplication(
      this.context.balena.application.name,
      this.deviceType.slug,
      {
        delta: this.options.balena.application.env.delta,
      },
    );
    this.teardown.register(() => {
      return this.context.balena.sdk
        .removeApplication(this.context.balena.application.name)
        .catch(
          {
            code: 'BalenaNotLoggedIn',
          },
          noop,
        )
        .catch(
          {
            code: 'BalenaApplicationNotFound',
          },
          noop,
        );
    });

    await this.context.balena.sdk.addSSHKey(
      this.context.balena.sshKey.label,
      await this.context.utils.createSSHKey(this.context.sshKeyPath),
    );
    this.teardown.register(() => {
      return Bluebird.resolve(
        this.context.balena.sdk.removeSSHKey(this.context.balena.sshKey.label),
      ).catch(
        {
          code: 'BalenaNotLoggedIn',
        },
        noop,
      );
    });

    await this.context.balena.sdk.disableAutomaticUpdates(
      this.context.balena.application.name,
    );
    // Device Provision with preloaded application
    const promiseDownload = this.context.balena.deviceApplicationChain
      .init({
        url: 'https://github.com/balena-io-projects/balena-cpp-hello-world.git',
        sdk: this.context.balena.sdk,
        path: this.options.tmpdir,
      })
      .then(chain => {
        return chain.clone();
      })
      .then(async chain => {
        return chain.push(
          {
            name: 'master',
          },
          {
            name: 'balena',
            url: await this.context.balena.sdk.getApplicationGitRemote(
              this.context.balena.application.name,
            ),
          },
        );
      })
      .then(chain => {
        this.context = { preload: { hash: chain.getPushedCommit() } };
        return chain.emptyCommit();
      })
      .then(chain => {
        return chain.push({ name: 'master' });
      });

    await this.context.os.fetch(this.options.packdir, {
      type: this.options.balenaOS.download.type,
      version: this.options.balenaOS.download.version,
    });
    await promiseDownload;
    await new CLI().preload(this.context.os.image.path, {
      app: this.context.balena.application.name,
      commit: this.context.preload.hash,
      pin: true,
    });

    this.globalContext = {
      balena: { uuid: await this.context.balena.sdk.generateUUID() },
    };
    this.context.os.addCloudConfig(
      await this.context.balena.sdk.getDeviceOSConfiguration(
        this.context.balena.uuid,
        await this.context.balena.sdk.register(
          this.context.balena.application.name,
          this.context.balena.uuid,
        ),
        this.context.os.contract.version,
      ),
    );

    this.teardown.register(() => {
      console.log('Worker teardown');
      return this.context.worker.teardown();
    });
    console.log('Setting up worker');
    await this.context.worker.select({
      type: this.options.worker.type,
    });
    await this.context.worker.network(this.options.balenaOS.network);
    await this.context.worker.flash(this.context.os);
    await this.context.worker.on();

    // Checking if device is reachable
    console.log('Waiting for device to be reachable');
    await this.context.utils.waitUntil(() => {
      return this.context.balena.sdk.isDeviceOnline(this.context.balena.uuid);
    });
    assert.equal(
      await this.context.balena.sdk.executeCommandInHostOS(
        'cat /etc/hostname',
        this.context.balena.uuid,
      ),
      this.context.balena.uuid.slice(0, 7),
      'Device should be reachable',
    );
  },
  tests: [
    './tests/preload',
    './tests/register',
    //  './tests/download-strategies',
    './tests/move',
    './tests/supervisor-api',
    // './tests/hostapp',
  ],
};
