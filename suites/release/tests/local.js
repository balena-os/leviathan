/* Copyright 2019 balena
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

const { join } = require('path');

module.exports = {
  title: 'Local mode tests',
  os: {
    type: 'string',
    required: ['variant'],
    const: 'development',
  },
  run: async function(test) {
    const sdk = new (this.require('components/balena/sdk'))(
      this.suite.options.balenaOS.download.source,
    );

    const currentVersion = this.context.os.image.version;
    const updateVersion = await sdk.getMaxSatisfyingVersion(
      this.deviceType.slug,
      `<${this.context.os.image.version}`,
    );

    this.subtest(test, {
      title: `Test OS update from ${updateVersion} to ${currentVersion}`,
      run: async function(subtest) {
        // This should have the same source as the image download we do later.
        // As the update should be contained by a singular environment.
        if (updateVersion == null) {
          throw new Error(
            `Could not find any supported version previous to ${this.context.os.image.version}`,
          );
        }

        await this.context.worker.off();
        await this.context.balena.sdk.removeDevice(this.context.balena.uuid);

        // Re-provision device
        await this.context.os.fetch(this.suite.options.tmpdir, {
          type: this.suite.options.balenaOS.download.type,
          version: updateVersion,
          source: this.suite.options.balenaOS.download.source,
        });

        const uuid = await this.context.balena.sdk.generateUUID();
        this.context.os.addCloudConfig(
          await this.context.balena.sdk.getDeviceOSConfiguration(
            uuid,
            await this.context.balena.sdk.register(
              this.context.balena.application.name,
              uuid,
            ),
            this.context.os.image.version,
          ),
        );

        await this.context.worker.ready();
        await this.context.worker.flash(this.context.os);
        await this.context.worker.on();

        // Checking if device is reachable
        console.log('Waiting for device to be online');
        await this.context.utils.waitUntil(() => {
          return this.context.balena.sdk.isDeviceOnline(uuid);
        });
      },
    });
  },
};
