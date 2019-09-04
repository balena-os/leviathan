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

const request = require('request-promise');

// The actualy functionaly of the supervisor API is tested in the supervisor suite.
// This is aimed at testing the balenaCloud API is proxying the request correctly.
module.exports = {
  title: 'Test Supervisor API through the balenaCloud API',
  run: async function() {
    // Helpers
    this.context = {
      local: {
        supervisorRequest: async (method, uri, body) => {
          return request({
            method,
            uri: `${this.context.balena.sdk.getApiUrl()}/supervisor${uri}`,
            headers: {
              Authorization: `Bearer ${await this.context.balena.sdk.getToken()}`,
            },
            body,
            json: true,
          });
        },
        apiUp: async () => {
          await this.context.utils.waitUntil(async () => {
            return (
              (await this.context.local.supervisorRequest('POST', '/ping', {
                uuid: this.context.balena.uuid,
                method: 'GET',
              })) === 'OK'
            );
          });
        },
      },
    };

    await this.context.balena.deviceApplicationChain
      .getChain()
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

    await this.context.local.apiUp();
  },
  tests: [
    {
      title: 'GET /ping',
      run: async function(subtest) {
        const body = await this.context.local.supervisorRequest(
          'POST',
          '/ping',
          {
            uuid: this.context.balena.uuid,
            method: 'GET',
          },
        );
        subtest.is(body, 'OK', 'Response should be expected');
      },
    },
    {
      title: 'v1',
      tests: [
        {
          title: 'POST /v1/blink',
          run: async function(test) {
            const body = await this.context.local.supervisorRequest(
              'POST',
              '/v1/blink',
              {
                uuid: this.context.balena.uuid,
              },
            );
            test.is(body, 'OK', 'Response should be expected');
          },
        },
        {
          title: 'POST /v1/update',
          run: async function(test) {
            const body = await this.context.local.supervisorRequest(
              'POST',
              '/v1/update',
              {
                uuid: this.context.balena.uuid,
              },
            );

            test.is(body, undefined, 'Response should be expected');
          },
        },
        {
          title: 'GET /v1/device',
          run: async function(test) {
            const body = await this.context.local.supervisorRequest(
              'POST',
              '/v1/device',
              {
                uuid: this.context.balena.uuid,
                method: 'GET',
              },
            );

            test.match(
              body,
              {
                api_port: /.*/,
                ip_address: /.*/,
                os_version: /.*/,
                supervisor_version: /.*/,
                update_pending: /.*/,
                update_failed: /.*/,
              },
              'Response should be expected',
            );
          },
        },
        {
          title: 'GET /v1/healthy',
          run: async function(test) {
            const body = await this.context.local.supervisorRequest(
              'POST',
              '/v1/healthy',
              {
                uuid: this.context.balena.uuid,
                method: 'GET',
              },
            );

            test.is(body, 'OK', 'Response should be expected');
          },
        },
        {
          title: 'POST /v1/regenerate-api-key',
          run: async function(test) {
            const body = await this.context.local.supervisorRequest(
              'POST',
              '/v1/regenerate-api-key',
              {
                uuid: this.context.balena.uuid,
              },
            );

            test.match(body, /[a-z0-9]{62}/, 'Response should be expected');
          },
        },
        {
          title: 'Application endpoints',
          run: async function() {
            this.context = {
              local: {
                appId: await this.context.balena.sdk.getApplicationId(
                  this.context.balena.application.name,
                ),
              },
            };
          },
          tests: [
            {
              title: 'POST /v1/purge',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  '/v1/purge',
                  {
                    uuid: this.context.balena.uuid,
                    data: { appId: this.context.local.appId },
                  },
                );

                test.same(
                  body,
                  { Data: 'OK', Error: '' },
                  'Response should be expected',
                );

                await this.context.balena.sdk.triggerDeviceUpdate(
                  this.context.balena.uuid,
                );
                await this.context.balena.deviceApplicationChain
                  .getChain()
                  .waitServiceProperties(
                    {
                      commit: this.context.balena.deviceApplicationChain
                        .getChain()
                        .getPushedCommit(),
                      status: 'Running',
                    },
                    this.context.balena.uuid,
                  );
              },
            },
            {
              title: 'POST /v1/restart',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  '/v1/restart',
                  {
                    uuid: this.context.balena.uuid,
                    data: { appId: this.context.local.appId },
                  },
                );

                test.is(body, 'OK', 'Response should be expected');
              },
            },
            {
              title: 'POST /v1/apps/:appId/stop',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  `/v1/apps/${this.context.local.appId}/stop`,
                  {
                    uuid: this.context.balena.uuid,
                  },
                );

                test.match(
                  body,
                  { containerId: /.*/ },
                  'Response should be expected',
                );
              },
            },
            {
              title: 'POST /v1/apps/:appId/start',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  `/v1/apps/${this.context.local.appId}/start`,
                  {
                    uuid: this.context.balena.uuid,
                  },
                );

                test.match(
                  body,
                  { containerId: /.*/ },
                  'Response should be expected',
                );
              },
            },
            {
              title: 'GET /v1/apps/:appId',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  `/v1/apps/${this.context.local.appId}`,
                  {
                    uuid: this.context.balena.uuid,
                    method: 'GET',
                  },
                );

                test.match(
                  body,
                  {
                    appId: /.*/,
                    commit: /.*/,
                    releaseId: /.*/,
                    containerId: /.*/,
                    env: /.*/,
                  },
                  'Response should be expected',
                );
              },
            },
          ],
        },
        {
          title: 'Host OS configuration endpoints',
          run: async function() {
            this.context = {
              local: {
                hostConfig: {
                  network: {
                    hostname: 'newhostname',
                  },
                },
              },
            };
          },
          tests: [
            {
              title: 'PATCH /v1/device/host-config',
              run: async function(sssubtest) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  '/v1/device/host-config',
                  {
                    uuid: this.context.balena.uuid,
                    method: 'PATCH',
                    data: this.context.localhostConfig,
                  },
                );

                sssubtest.is(body, 'OK', 'Response should be expected');
              },
            },
            {
              title: 'GET /v1/device/host-config',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  '/v1/device/host-config',
                  {
                    uuid: this.context.balena.uuid,
                    method: 'GET',
                  },
                );

                test.deepEquals(
                  body,
                  this.context.local.hostConfig,
                  'Response should be expected',
                );
              },
            },
          ],
        },
        {
          title: 'POST /v1/reboot',
          run: async function(test) {
            const body = await this.context.local.supervisorRequest(
              'POST',
              '/v1/reboot',
              {
                uuid: this.context.balena.uuid,
              },
            );

            test.same(
              body,
              { Data: 'OK', Error: undefined },
              'Response should be expected',
            );

            await this.context.local.apiUp();

            test.pass('Supervisor API should be available again');
          },
        },
        {
          title: 'POST /v1/shutdown',
          run: async function(test) {
            const body = await this.context.local.supervisorRequest(
              'POST',
              '/v1/shutdown',
              {
                uuid: this.context.balena.uuid,
              },
            );

            test.same(
              body,
              { Data: 'OK', Error: undefined },
              'Response should be expected',
            );

            await this.context.worker.on();

            await this.context.local.apiUp();

            test.pass('Supervisor API should be available again');
          },
        },
      ],
    },
    {
      title: 'v2',
      tests: [
        {
          title: 'Applications endpoints',
          run: async function(ssubtest) {
            this.context = {
              local: {
                appId: await this.context.balena.sdk.getApplicationId(
                  this.context.balena.application.name,
                ),
              },
            };
          },
          tests: [
            {
              title: 'POST /v2/applications/:appId/purge',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  `/v2/applications/${this.context.local.appId}/purge`,
                  {
                    uuid: this.context.balena.uuid,
                  },
                );

                test.is(body, 'OK', 'Response should be expected');

                await this.context.balena.sdk.triggerDeviceUpdate(
                  this.context.balena.uuid,
                );
                await this.context.balena.deviceApplicationChain
                  .getChain()
                  .waitServiceProperties(
                    {
                      commit: this.context.balena.deviceApplicationChain
                        .getChain()
                        .getPushedCommit(),
                      status: 'Running',
                    },
                    this.context.balena.uuid,
                  );
              },
            },
            {
              title: 'GET /v2/applications/state',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  '/v2/applications/state',
                  {
                    uuid: this.context.balena.uuid,
                    method: 'GET',
                  },
                );

                test.match(
                  body,
                  {
                    [this.context.balena.application.name]: {
                      appId: /.*/,
                      commit: /.*/,
                      services: {
                        main: {
                          status: /.*/,
                          releaseId: /.*/,
                        },
                      },
                    },
                  },
                  'Response should be expected',
                );
              },
            },
            {
              title: 'GET /v2/applications/:appId/state',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  '/v2/applications/:appId/state',
                  {
                    uuid: this.context.balena.uuid,
                    method: 'GET',
                  },
                );

                test.match(
                  body,
                  {
                    local: { [this.context.local.appId]: { services: {} } },
                    dependent: {},
                    commit: /.*/,
                  },
                  'Response should be expected',
                );
              },
            },
            {
              title: 'POST /v2/applications/:appId/restart-service',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  `/v2/applications/${this.context.local.appId}/restart-service`,
                  {
                    uuid: this.context.balena.uuid,
                    data: {
                      serviceName: 'main',
                    },
                  },
                );

                test.is(body, 'OK', 'Response should be expected');
              },
            },
            {
              title: 'POST /v2/applications/:appId/stop-service',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  `/v2/applications/${this.context.local.appId}/stop-service`,
                  {
                    uuid: this.context.balena.uuid,
                    data: {
                      serviceName: 'main',
                    },
                  },
                );

                test.is(body, 'OK', 'Response should be expected');
              },
            },
            {
              title: 'POST /v2/applications/:appId/start-service',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  `/v2/applications/${this.context.local.appId}/restart-service`,
                  {
                    uuid: this.context.balena.uuid,
                    data: {
                      serviceName: 'main',
                    },
                  },
                );

                test.is(body, 'OK', 'Response should be expected');
              },
            },
            {
              title: 'POST /v2/applications/:appId/restart',
              run: async function(test) {
                const body = await this.context.local.supervisorRequest(
                  'POST',
                  `/v2/applications/${this.context.local.appId}/restart`,
                  {
                    uuid: this.context.balena.uuid,
                  },
                );

                test.is(body, 'OK', 'Response should be expected');
              },
            },
          ],
        },
        {
          title: 'GET /v2/containerId',
          run: async function(test) {
            const body = await this.context.local.supervisorRequest(
              'POST',
              '/v2/containerId',
              {
                uuid: this.context.balena.uuid,
                method: 'GET',
                data: {
                  service: 'main',
                },
              },
            );

            test.match(
              body,
              { status: /.*/, services: { main: /.*/ } },
              'Response should be expected',
            );
          },
        },
        {
          title: 'GET /v2/state/status',
          run: async function(test) {
            const body = await this.context.local.supervisorRequest(
              'POST',
              '/v2/state/status',
              {
                uuid: this.context.balena.uuid,
                method: 'GET',
              },
            );

            test.match(
              body,
              {
                status: /.*/,
                appState: /.*/,
                containers: [
                  {
                    status: /.*/,
                    serviceName: /.*/,
                    appId: /.*/,
                    imageId: /.*/,
                    serviceId: /.*/,
                    containerId: /.*/,
                    createdAt: /.*/,
                  },
                ],
                images: [
                  {
                    name: /.*/,
                    appId: /.*/,
                    serviceName: /.*/,
                    imageId: /.*/,
                    dockerImageId: /.*/,
                    status: /.*/,
                  },
                ],
                release: /.*/,
              },
              'Response should be expected',
            );
          },
        },
        {
          title: 'GET /v2/version',
          run: async function(test) {
            const body = await this.context.local.supervisorRequest(
              'POST',
              '/v2/version',
              {
                uuid: this.context.balena.uuid,
                method: 'GET',
              },
            );

            test.match(
              body,
              { status: 'success', version: /.*/ },
              'Response should be expected',
            );
          },
        },
      ],
    },
  ],
};
