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
  title: 'Move device between applications',
  run: async function(test) {
    let hash = await this.context.balena.sdk.getDeviceCommit(this.context.balena.uuid);

    if (hash == null) {
      await this.context.balena.deviceApplicationChain
        .init({
          url: 'https://github.com/balena-io-projects/balena-cpp-hello-world.git',
          sdk: this.context.balena.sdk,
          path: this.options.tmpdir
        })
        .then(chain => {
          return chain.clone();
        })
        .then(async chain => {
          return chain.push(
            {
              name: 'master'
            },
            {
              name: 'balena',
              url: await this.context.balena.sdk.getApplicationGitRemote(
                this.context.balena.application.name
              )
            }
          );
        })
        .then(async chain => {
          hash = chain.getPushedCommit();
          return chain.waitServiceProperties(
            {
              commit: hash,
              status: 'Running'
            },
            this.context.balena.uuid
          );
        });

      test.is(await this.context.balena.sdk.getDeviceCommit(this.context.balena.uuid), hash);
    }

    const moveApplicationName = `${this.context.balena.application.name}_MoveDevice`;

    await this.context.balena.sdk.createApplication(
      moveApplicationName,
      this.context.deviceType.slug,
      {
        delta: this.context.balena.application.env.delta
      }
    );
    this.teardown.register(() => {
      return this.context.balena.sdk.removeApplication(moveApplicationName);
    }, test.name);

    let moveHash;

    await this.context.balena.deviceApplicationChain
      .init({
        url: 'https://github.com/balena-io-projects/simple-server-node',
        sdk: this.context.balena.sdk,
        path: this.options.tmpdir
      })
      .then(chain => {
        return chain.clone();
      })
      .then(async chain => {
        return chain.push(
          {
            name: 'master'
          },
          {
            name: 'balena',
            url: await this.context.balena.sdk.getApplicationGitRemote(moveApplicationName)
          }
        );
      })
      .then(chain => {
        moveHash = chain.getPushedCommit();
      });

    // Sanity check
    test.is(
      await this.context.balena.sdk.getApplicationCommit(moveApplicationName),
      moveHash,
      'Pushed commit should match API records'
    );

    await this.context.balena.sdk.moveDeviceToApplication(
      this.context.balena.uuid,
      moveApplicationName
    );

    await this.context.balena.deviceApplicationChain.getChain().waitServiceProperties(
      {
        commit: moveHash,
        status: 'Running'
      },
      this.context.balena.uuid
    );

    test.is(
      await this.context.balena.sdk.getDeviceCommit(this.context.balena.uuid),
      moveHash,
      `Device moved to: ${moveApplicationName}`
    );

    await this.context.balena.sdk.moveDeviceToApplication(
      this.context.balena.uuid,
      this.context.balena.application.name
    );

    await this.context.balena.deviceApplicationChain.getChain().waitServiceProperties(
      {
        commit: hash,
        status: 'Running'
      },
      this.context.balena.uuid
    );

    test.is(
      await this.context.balena.sdk.getDeviceCommit(this.context.balena.uuid),
      hash,
      `Device moved back to: ${this.context.balena.application.name}`
    );
  }
};
