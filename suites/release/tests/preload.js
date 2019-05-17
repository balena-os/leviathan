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

module.exports = {
  title: 'Preload feature tests',
  tests: [
    {
      title: 'Pinning test',
      run: async function(test) {
        this.teardown.register(async () => {
          const commit = await this.context.balena.sdk.getLatestRelease(
            this.context.balena.application.name
          );

          await this.context.balena.sdk.trackApplicationRelease(this.context.balena.uuid);
          await this.context.balena.sdk.triggerDeviceUpdate(this.context.balena.uuid);
          await this.context.balena.deviceApplicationChain.getChain().waitServiceProperties(
            {
              commit,
              status: 'Running'
            },
            this.context.balena.uuid
          );
        }, test.name);

        test.is(
          await this.context.balena.sdk.getDeviceCommit(this.context.balena.uuid),
          this.context.preload.hash,
          'The API should report the preloaded commit hash'
        );

        const deviceLogs = (await this.context.balena.sdk.getDeviceLogsHistory(
          this.context.balena.uuid
        )).map(log => {
          return log.message;
        });

        test.notMatch([deviceLogs], [/Downloading/], 'Device logs shouldn\'t output "Downloading"');
        test.match([deviceLogs], [/Hello, world!/], 'Application log outputs "Hello, world!"');
      }
    }
  ]
};
