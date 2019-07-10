/*
 * Copyright 2019 balena
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

module.exports = {
  title: 'balenaCloud register tests',
  tests: [
    {
      title: 'Pre-register test',
      run: async function(assert) {
        const devices = await this.context.balena.sdk.getDevices(
          this.context.balena.application.name
        );

        // Sanity check
        assert.equals(devices.length, 1, 'Only one device should be registered');
        assert.equals(
          devices[0].uuid,
          this.context.balena.uuid,
          'Registered device should have the UUID we assigned'
        );
        assert.true(
          await this.context.balena.sdk.isDeviceOnline(this.context.balena.uuid),
          'Device should be marked as online'
        );
      }
    },
    {
      title: 'Normal register test',
      run: async function(assert) {
        const configuration = await this.context.balena.sdk.getApplicationOSConfiguration(
          this.context.balena.application.name,
          { version: this.context.os.image.version }
        );

        await this.context.balena.sdk.executeCommandInHostOS(
          `echo '${JSON.stringify(configuration)}' > /mnt/boot/config.json && reboot`,
          this.context.balena.uuid
        );

        await this.context.utils.waitUntil(async () => {
          return (
            (await this.context.balena.sdk.getDevices(this.context.balena.application.name))
              .length > 1
          );
        });

        let devices = await this.context.balena.sdk.getDevices(
          this.context.balena.application.name
        );

        // Sanity check
        assert.equals(devices.length, 2, 'We should have two devices registered');
        devices = devices.filter(device => {
          return device.uuid !== this.context.balena.uuid;
        });
        // Sanity check
        assert.equals(devices.length, 1, 'We should only have one other device registered');

        await this.context.utils.waitUntil(() => {
          return this.context.balena.sdk.isDeviceOnline(devices[0].uuid);
        });

        // Sanity check
        assert.false(
          await this.context.balena.sdk.isDeviceOnline(this.context.balena.uuid),
          'Old device should be offline'
        );

        // Wire new registration in our context
        await this.context.balena.sdk.removeDevice(this.context.balena.uuid);
        this.globalContext = {
          balena: { uuid: devices[0].uuid }
        };
      }
    }
  ]
};
