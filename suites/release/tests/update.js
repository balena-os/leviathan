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
  title: 'Update strategies tests',
  run: async function(test) {
    await this.context.balena.deviceApplicationChain
      .getChain()
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
        return chain.waitServiceProperties(
          {
            commit: chain.getPushedCommit(),
            status: 'Running'
          },
          this.context.balena.uuid
        );
      });

    this.subtest(test, {
      title: 'Test download-then-kill',
      run: async function(subtest) {
        await this.context.balena.deviceApplicationChain
          .getChain()
          .emptyCommit()
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
            return chain.waitServiceProperties(
              {
                commit: chain.getPushedCommit(),
                status: 'Running'
              },
              this.context.balena.uuid
            );
          });

        subtest.pass('we here bois');
      }
    });
    this.subtest(test, {
      title: 'Test kill-then-download',
      run: async function(subtest) {}
    });
    this.subtest(test, {
      title: 'Test delete-then-download',
      run: async function(subtest) {}
    });
    this.subtest(test, {
      title: 'Test hand-over',
      run: async function(subtest) {}
    });
  }
};
