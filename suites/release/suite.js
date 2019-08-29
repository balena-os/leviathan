/*
 * Copyright 2018 balena
 *
 * @license Apache-2.0
 */

'use strict';

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

    this.globalContext = { utils: this.require('common/utils') };

    fse.ensureDirSync(this.options.tmpdir);

    this.globalContext = { sshKeyPath: join(homedir(), 'id') };

    this.globalContext = {
      balena: { sdk: new Balena(this.options.balena.apiUrl) },
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

    this.globalContext = {
      balena: { application: this.options.balena.application },
    };

    await this.context.balena.sdk
      .createApplication(
        this.context.balena.application.name,
        this.deviceType.slug,
        {
          delta: this.context.balena.application.env.delta,
        },
      )
      .catch(console.error);
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
      this.options.balena.sshKeyLabel,
      await this.context.utils.createSSHKey(this.context.sshKeyPath),
    );
    this.teardown.register(() => {
      return Bluebird.resolve(
        this.context.balena.sdk.removeSSHKey(this.options.balena.sshKeyLabel),
      ).catch(
        {
          code: 'BalenaNotLoggedIn',
        },
        noop,
      );
    });

    this.globalContext = {
      worker: new Worker(this.deviceType.slug, this.options.worker.url),
    };

    this.globalContext = {
      os: new BalenaOS({
        deviceType: this.deviceType.slug,
        network: this.options.balenaOS.network,
      }),
    };

    // Device Provision with preloaded application
    await this.context.os.fetch(this.options.tmpdir, {
      type: this.options.balenaOS.download.type,
      version: this.options.balenaOS.download.version,
      source: this.options.balenaOS.download.source,
    });

    // Preload image
    this.globalContext = {
      balena: { deviceApplicationChain: new DeviceApplication().getChain() },
    };

    await this.context.balena.deviceApplicationChain
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
        this.context.os.image.version,
      ),
    );

    await this.context.worker.select({
      type: this.options.worker.type,
    });
    await this.context.worker.network({
      wired: {
        nat: true,
      },
    });
    await this.context.worker.flash(this.context.os);
    await this.context.worker.on();
    this.teardown.register(() => {
      return this.context.worker.off();
    });

    // Checking if device is reachable
    console.log('Waiting for device to be online');
    await this.context.utils.waitUntil(() => {
      return this.context.balena.sdk.isDeviceOnline(this.context.balena.uuid);
    });
  },
  tests: [
    './tests/download-strategies',
    './tests/preload',
    './tests/register',
    './tests/move',
    './tests/supervisor-api',
    './tests/hostapp',
  ],
};
