/*
 * Copyright 2018 balena
 *
 * @license Apache-2.0
 */

'use strict';

module.exports = {
  setup: async (root, options) => {
    const noop = require('lodash/noop');

    const Bluebird = require('bluebird');
    const fse = require('fs-extra');
    const { join } = require('path');
    const { homedir } = require('os');

    const utils = require(join(root, 'lib', 'common', 'utils'));
    const Teardown = require(join(root, 'lib', 'common', 'teardown'));
    const Worker = require(join(root, 'lib', 'workers', options.worker.type));
    const BalenaOS = require(join(root, 'lib', 'components', 'os', 'balenaos'));
    const Balena = require(join(root, 'lib', 'components', 'balena', 'sdk'));

    const teardown = new Teardown();

    return Bluebird.try(async () => {
      fse.ensureDirSync(options.tmpdir);
      const deviceType = require(join(
        root,
        'contracts',
        'contracts',
        'hw.device-type',
        options.deviceType,
        'contract.json'
      ));

      const sshKeyPath = join(homedir(), 'id');

      const sdk = new Balena(options.balena.apiUrl);

      await sdk.loginWithToken(options.balena.apiKey);
      teardown.register(() => {
        return sdk.logout().catch(
          {
            code: 'BalenaNotLoggedIn'
          },
          noop
        );
      });

      await sdk.createApplication(options.balena.application.name, deviceType.slug, {
        delta: options.balena.application.env.delta
      });
      teardown.register(() => {
        return sdk
          .removeApplication(options.balena.application.name)
          .catch(
            {
              code: 'BalenaNotLoggedIn'
            },
            noop
          )
          .catch(
            {
              code: 'BalenaApplicationNotFound'
            },
            noop
          );
      });

      await sdk.addSSHKey(options.balena.sshKeyLabel, await utils.createSSHKey(sshKeyPath));
      teardown.register(() => {
        return Bluebird.resolve(sdk.removeSSHKey(options.balena.sshKeyLabel)).catch(
          {
            code: 'BalenaNotLoggedIn'
          },
          noop
        );
      });

      const uuid = await sdk.generateUUID();
      const deviceApiKey = await sdk.register(options.balena.application.name, uuid);

      const os = new BalenaOS({
        deviceType: deviceType.slug,
        download: {
          type: options.balenaOS.download.type,
          version: options.balenaOS.download.version,
          source: options.balenaOS.download.source
        },
        network: options.balenaOS.network
      });

      const worker = new Worker('main worker', deviceType.slug, {
        devicePath: options.worker.device
      });

      await os.fetch(options.tmpdir);

      os.balena.configJson = await sdk.getDeviceOSConfiguration(
        uuid,
        deviceApiKey,
        os.image.version
      );

      await worker.ready();
      await worker.flash(os);
      await worker.on();
      teardown.register(() => {
        return worker.off();
      });

      console.log('Waiting for device to be online');
      await utils.waitUntil(() => {
        return sdk.isDeviceOnline(uuid);
      });

      return {
        balena: {
          application: options.balena.application,
          sdk,
          uuid,
          sync: require(join(root, 'lib', 'components', 'balena', 'sync'))
        },
        utils,
        os,
        worker,
        sshKeyPath,
        deviceType,
        teardown,
        tmpdir: options.tmpdir
      };
    }).catch(async error => {
      await teardown.run(setImmediate);
      throw error;
    });
  },
  tests: [
    'device-online.js',
    //    'os-file-format.js',
    'device-reportOsVersion.js',
    //    'hostapp-update.js',
    'balena-sync.js',
    'push-container.js',
    'balena-device-progress.js',
    'update-supervisor-through-api.js',
    'push-multicontainer.js',
    'move-device-between-applications.js',
    'reload-supervisor.js',
    'chrony-ntp-time-sync',
    'i-service-variables.js',
    'i-bluetooth-test.js',
    'i-enter-container.js',
    'i-kernel-splash-screen.js',
    'i-identification-led.js',
    'i-balena-splash-screen.js',
    'i-reboot-with-app.js',
    'i-rpi-serial-uart0.js',
    'i-rpi-serial-uart1.js',
    'i-hdmi-uart5.js'
  ]
};
