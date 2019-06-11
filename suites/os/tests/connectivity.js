/*
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

const assert = require('assert');

const URL_TEST = 'www.google.com';

module.exports = {
  title: 'Connectivity tests',
  tests: [
    {
      title: 'Interface tests',
      tests: ['ethernet', 'wifi'].map(adaptor => {
        return {
          title: `${adaptor.charAt(0).toUpperCase()}${adaptor.slice(1)} test`,
          run: async function(test) {
            const iface = await this.context.worker.executeCommandInHostOS(
              `nmcli d  | grep ' ${adaptor} ' | awk '{print $1}'`,
              this.context.link
            );

            if (iface === '') {
              throw new Error(`No ${adaptor} interface found.`);
            }

            await this.context.worker.executeCommandInHostOS(
              `ping -c 10 -I ${iface} ${URL_TEST}`,
              this.context.link
            );

            test.true(`${URL_TEST} responded over ${adaptor}`);
          }
        };
      })
    },
    {
      title: 'Proxy tests',
      tests: ['redsocks', 'http-connect'].map(proxy => {
        return {
          title: `${proxy.charAt(0).toUpperCase()}${proxy.slice(1)} test`,
          run: async function(test) {
            const PROXY_PORT = 8123;

            await this.context.worker.executeCommandInHostOS(
              'mkdir -p /mnt/boot/system-proxy',
              this.context.link
            );

            const internalIp = await this.context.worker.proxy({
              port: PROXY_PORT
            });

            await this.context.worker.executeCommandInHostOS(
              'printf "' +
                'base { \n' +
                'log_debug = off; \n' +
                'log_info = on; \n' +
                'log = stderr; \n' +
                'daemon = off; \n' +
                'redirector = iptables; \n' +
                '} \n' +
                'redsocks { \n' +
                `type = ${proxy}; \n` +
                `ip = ${internalIp}; \n` +
                `port = ${PROXY_PORT}; \n` +
                'local_ip = 127.0.0.1; \n' +
                'local_port = 12345; \n' +
                '} \n" > /mnt/boot/system-proxy/redsocks.conf',
              this.context.link
            );

            // Start reboot check
            const boot0 = new Date(
              await this.context.worker.executeCommandInHostOS(
                `date -d "$(</proc/uptime awk '{print $1}') seconds ago" --rfc-3339=seconds`,
                this.context.link
              )
            );
            await this.context.worker.executeCommandInHostOS(
              'nohup bash -c "sleep 1 ; reboot &"',
              this.context.link
            );
            assert(
              new Date(
                await this.context.worker.executeCommandInHostOS(
                  `date -d "$(</proc/uptime awk '{print $1}') seconds ago" --rfc-3339=seconds`,
                  this.context.link
                )
              ) > boot0,
              'Device should have rebooted'
            );

            await this.context.worker.executeCommandInHostOS(
              `ping -c 10 ${URL_TEST}`,
              this.context.link
            );
            test.true(`${URL_TEST} responded over ${proxy} proxy`);

            await this.context.worker.executeCommandInHostOS(
              'rm -rf /mnt/boot/system-proxy',
              this.context.link
            );

            // Start reboot check
            const boot1 = new Date(
              await this.context.worker.executeCommandInHostOS(
                `date -d "$(</proc/uptime awk '{print $1}') seconds ago" --rfc-3339=seconds`,
                this.context.link
              )
            );
            await this.context.worker.executeCommandInHostOS(
              'nohup bash -c "sleep 1 ; reboot &"',
              this.context.link
            );
            assert(
              new Date(
                await this.context.worker.executeCommandInHostOS(
                  `date -d "$(</proc/uptime awk '{print $1}') seconds ago" --rfc-3339=seconds`,
                  this.context.link
                )
              ) > boot1,
              'Device should have rebooted'
            );
          }
        };
      })
    }
  ]
};
