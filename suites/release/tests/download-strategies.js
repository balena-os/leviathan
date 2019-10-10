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

const isEmpty = require('lodash/isEmpty');
const sortBy = require('lodash/sortBy');
const { join } = require('path');
const request = require('request-promise');

module.exports = {
  title: 'Download strategies tests',
  run: async function(test) {
    this.context = {
      local: {
        getContainerId: async serviceName => {
          await this.context.utils.waitUntil(async () => {
            await this.context.balena.sdk.pingSupervisor(
              this.context.balena.uuid,
            );
            return true;
          });

          // Wait for the supervisor to retrieve containerId info
          let result;
          await this.context.utils.waitUntil(async () => {
            result = await request({
              method: 'POST',
              uri: `${this.context.balena.sdk.getApiUrl()}/supervisor/v2/containerId`,
              headers: {
                Authorization: `Bearer ${await this.context.balena.sdk.getToken()}`,
              },
              body: {
                method: 'GET',
                uuid: this.context.balena.uuid,
                data: {
                  service: serviceName,
                },
              },
              json: true,
            });

            return !isEmpty(result.services);
          });

          return result;
        },
        testTemplate: async (strategy, test) => {
          await this.context.balena.sdk.setConfigurationVar(
            this.context.balena.uuid,
            'RESIN_SUPERVISOR_UPDATE_STRATEGY',
            strategy,
          );
          this.teardown.register(async () => {
            await this.context.balena.sdk.removeConfigurationVar(
              this.context.balena.uuid,
              'RESIN_SUPERVISOR_UPDATE_STRATEGY',
            );
          }, test.name);

          const services = await this.context.balena.sdk.getServiceNames(
            this.context.balena.uuid,
          );
          test.is(services.length, 1, 'Only one service should be running');
          const iContainer = (await this.context.local.getContainerId(
            services[0],
          )).services[services[0]];
          const iImage = JSON.parse(
            await this.context.balena.sdk.executeCommandInHostOS(
              `balena inspect ${iContainer} --format='{{json .Image}}' | sed -e 's/^"//' -e 's/"$//'| xargs balena inspect --format='{{json .Id}}'`,
              this.context.balena.uuid,
            ),
          );

          await this.context.balena.deviceApplicationChain
            .getChain()
            .commit(async repoPath => {
              await this.context.utils.searchAndReplace(
                join(repoPath, 'hello.cpp'),
                /printf(.*);/,
                `printf("${strategy}");`,
              );
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
            .then(async chain => {
              await this.context.balena.sdk.triggerDeviceUpdate(
                this.context.balena.uuid,
              );
              return chain.waitServiceProperties(
                {
                  commit: chain.getPushedCommit(),
                  status: 'Running',
                },
                this.context.balena.uuid,
                5,
                1000,
              );
            });

          const updateServices = await this.context.balena.sdk.getServiceNames(
            this.context.balena.uuid,
          );
          test.is(
            updateServices.length,
            1,
            'Only one service should still be running',
          );
          const uContainer = (await this.context.local.getContainerId(
            updateServices[0],
          )).services[updateServices[0]];

          // Map container id to image repository as the pull event refrences only the repository
          const uImage = JSON.parse(
            await this.context.balena.sdk.executeCommandInHostOS(
              `balena inspect ${uContainer} --format='{{json .Image}}' | sed -e 's/^"//' -e 's/"$//'| xargs balena inspect --format='{{json .RepoDigests}}'`,
              this.context.balena.uuid,
            ),
          )[0];

          // Get all the balena-engine events and format them ready for a JSON.parse
          const events = JSON.parse(
            await this.context.balena.sdk.executeCommandInHostOS(
              `printf '["null"'; balena events --since 1 --until "$(date +%Y-%m-%dT%H:%M:%S.%NZ)" --format '{{json .}}' | while read LINE; do printf ",$LINE"; done; printf ']'`,
              this.context.balena.uuid,
            ),
          );

          const iContainerEvents = events.filter(event => {
            return event.id === iContainer && event.Type === 'container';
          });
          const uContainerEvents = events.filter(event => {
            return event.id === uContainer && event.Type === 'container';
          });

          return {
            iContainer: {
              kill: iContainerEvents.find(event => {
                return event.Action === 'kill';
              }).timeNano,
              die: iContainerEvents.find(event => {
                return event.Action === 'die';
              }).timeNano,
              stop: iContainerEvents.find(event => {
                return event.Action === 'stop';
              }).timeNano,
              destroy: iContainerEvents.find(event => {
                return event.Action === 'destroy';
              }).timeNano,
            },
            uContainer: {
              create: uContainerEvents.find(event => {
                return event.Action === 'create';
              }).timeNano,
              start: uContainerEvents.find(event => {
                return event.Action === 'start';
              }).timeNano,
            },
            uImage: {
              pull: events.find(event => {
                return (
                  event.id === uImage &&
                  event.Action === 'pull' &&
                  event.Type === 'image'
                );
              }).timeNano,
            },
            iImage: {
              delete: events.find(event => {
                return (
                  event.id === iImage &&
                  event.Action === 'delete' &&
                  event.Type === 'image'
                );
              }).timeNano,
            },
          };
        },
      },
    };

    await this.context.balena.deviceApplicationChain
      .getChain()
      .init({
        url: 'https://github.com/balena-io-projects/balena-cpp-hello-world.git',
        sdk: this.context.balena.sdk,
        path: this.suite.options.tmpdir,
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
      .then(async chain => {
        await this.context.balena.sdk.triggerDeviceUpdate(
          this.context.balena.uuid,
        );
        return chain.waitServiceProperties(
          {
            commit: chain.getPushedCommit(),
            status: 'Running',
          },
          this.context.balena.uuid,
        );
      });
  },
  tests: [
    {
      title: 'download-then-kill strategy test',
      run: async function(test) {
        const times = await this.context.local.testTemplate(
          'download-then-kill',
          test,
        );

        const actionOrder = [
          { action: 'pull', time: times.uImage.pull },
          { action: 'kill', time: times.iContainer.kill },
          { action: 'die', time: times.iContainer.die },
          { action: 'stop', time: times.iContainer.stop },
          { action: 'destroy', time: times.iContainer.destroy },
          { action: 'delete', time: times.iImage.delete },
          { action: 'create', time: times.uContainer.create },
          { action: 'start', time: times.uContainer.start },
        ];

        test.strictDeepEquals(
          actionOrder.map(x => {
            return x.action;
          }),
          sortBy(actionOrder, ['time']).map(x => {
            return x.action;
          }, 'Action order should be as expected.'),
        );
      },
    },
    {
      title: 'kill-then-download strategy test',
      run: async function(test) {
        const times = await this.context.local.testTemplate(
          'kill-then-download',
          test,
        );

        const actionOrder = [
          { action: 'kill', time: times.iContainer.kill },
          { action: 'die', time: times.iContainer.die },
          { action: 'stop', time: times.iContainer.stop },
          { action: 'destroy', time: times.iContainer.destroy },
          { action: 'pull', time: times.uImage.pull },
          { action: 'delete', time: times.iImage.delete },
          { action: 'create', time: times.uContainer.create },
          { action: 'start', time: times.uContainer.start },
        ];

        test.strictDeepEquals(
          actionOrder.map(x => {
            return x.action;
          }),
          sortBy(actionOrder, ['time']).map(x => {
            return x.action;
          }, 'Action order should be as expected.'),
        );
      },
    },
    {
      title: 'delete-then-download strategy test',
      run: async function(test) {
        const times = await this.context.local.testTemplate(
          'delete-then-download',
          test,
        );

        const actionOrder = [
          { action: 'kill', time: times.iContainer.kill },
          { action: 'die', time: times.iContainer.die },
          { action: 'stop', time: times.iContainer.stop },
          { action: 'destroy', time: times.iContainer.destroy },
          { action: 'pull', time: times.uImage.pull },
          { action: 'delete', time: times.iImage.delete },
          { action: 'create', time: times.uContainer.create },
          { action: 'start', time: times.uContainer.start },
        ];

        test.strictDeepEquals(
          actionOrder.map(x => {
            return x.action;
          }),
          sortBy(actionOrder, ['time']).map(x => {
            return x.action;
          }, 'Action order should be as expected.'),
        );
      },
    },
    {
      title: 'hand-over strategy test',
      run: async function(test) {
        await this.context.balena.sdk.setConfigurationVar(
          this.context.balena.uuid,
          'RESIN_SUPERVISOR_HANDOVER_TIMEOUT',
          '1000',
        );
        this.teardown.register(async () => {
          await this.context.balena.sdk.removeConfigurationVar(
            this.context.balena.uuid,
            'RESIN_SUPERVISOR_HANDOVER_TIMEOUT',
          );
        });

        const times = await this.context.local.testTemplate('hand-over', test);

        const actionOrder = [
          { action: 'pull', time: times.uImage.pull },
          { action: 'create', time: times.uContainer.create },
          { action: 'start', time: times.uContainer.start },
          { action: 'kill', time: times.iContainer.kill },
          { action: 'die', time: times.iContainer.die },
          { action: 'stop', time: times.iContainer.stop },
          { action: 'destroy', time: times.iContainer.destroy },
          { action: 'delete', time: times.iImage.delete },
        ];

        test.strictDeepEquals(
          actionOrder.map(x => {
            return x.action;
          }),
          sortBy(actionOrder, ['time']).map(x => {
            return x.action;
          }, 'Action order should be as expected.'),
        );
      },
    },
  ],
};
