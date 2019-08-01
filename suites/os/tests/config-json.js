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

const rebootDevice = async that => {
  await that.context.worker.executeCommandInHostOS(
    'touch /tmp/reboot-check',
    that.context.link,
  ),
    await that.context.worker.executeCommandInHostOS(
      'systemd-run --on-active=2 /sbin/reboot',
      that.context.link,
    );
  assert(
    await that.context.worker.executeCommandInHostOS(
      '[[ ! -f /tmp/reboot-check ]] && echo "pass"',
      that.context.link,
    ),
    'pass',
    'Device should have rebooted',
  );
};

module.exports = {
  title: 'Config.json configuration tests',
  tests: [
    {
      title: 'hostname configuration test',
      run: async function(test) {
        const hostname = Math.random()
          .toString(36)
          .substring(2, 10);

        // Add hostname
        await this.context.worker.executeCommandInHostOS(
          `tmp=$(mktemp)&&cat /mnt/boot/config.json | jq '.hostname="${hostname}"' > $tmp&&mv "$tmp" /mnt/boot/config.json`,
          this.context.link,
        );

        // Start reboot check
        await this.context.worker.executeCommandInHostOS(
          'touch /tmp/reboot-check',
          this.context.link,
        );
        await this.context.worker.executeCommandInHostOS(
          'systemd-run --on-active=2 /sbin/reboot',
          this.context.link,
        );
        assert(
          await this.context.worker.executeCommandInHostOS(
            '[[ ! -f /tmp/reboot-check ]] && echo "pass"',
            `${hostname}.local`,
          ),
          'pass',
          'Device should have rebooted',
        );

        test.equal(
          await this.context.worker.executeCommandInHostOS(
            'cat /etc/hostname',
            `${hostname}.local`,
          ),
          hostname,
          'Device should have new hostname',
        );

        // Remove hostname
        await this.context.worker.executeCommandInHostOS(
          'tmp=$(mktemp)&&cat /mnt/boot/config.json | jq "del(.hostname)" > $tmp&&mv "$tmp" /mnt/boot/config.json',
          `${hostname}.local`,
        );

        // Start reboot check
        await this.context.worker.executeCommandInHostOS(
          'touch /tmp/reboot-check',
          `${hostname}.local`,
        ),
          await this.context.worker.executeCommandInHostOS(
            'systemd-run --on-active=2 /sbin/reboot',
            `${hostname}.local`,
          );
        assert(
          await this.context.worker.executeCommandInHostOS(
            '[[ ! -f /tmp/reboot-check ]] && echo "pass"',
            this.context.link,
          ),
          'pass',
          'Device should have rebooted',
        );
      },
    },
    {
      title: 'persistentLogging configuration test',
      run: async function(test) {
        //Clean all the previous logs, pretending this was the first boot
        await this.context.worker.executeCommandInHostOS(
          'rm -rf /mnt/state/root-overlay/var/log/journal/*',
          this.context.link,
        );
        await this.context.worker.executeCommandInHostOS(
          'journalctl --flush',
          this.context.link,
        );

        await rebootDevice(this);
        test.is(
          parseInt(
            await this.context.worker.executeCommandInHostOS(
              'journalctl --list-boot | wc -l',
              this.context.link,
            ),
          ),
          2,
          'Device should show previous boot records',
        );
      },
    },
    {
      title: 'ntpServer test',
      run: async function(test) {
        const ntpServer = (regex = '') => {
          return `time${regex}.google.com`;
        };

        await this.context.worker.executeCommandInHostOS(
          `tmp=$(mktemp)&&cat /mnt/boot/config.json | jq '.ntpServers="${ntpServer()}"' > $tmp&&mv "$tmp" /mnt/boot/config.json`,
          this.context.link,
        );

        await rebootDevice(this);

        await test.resolves(
          this.context.worker.executeCommandInHostOS(
            `chronyc sources | grep ${ntpServer('.*')}`,
            this.context.link,
          ),
          'Device should show one record with our ntp server',
        );

        await this.context.worker.executeCommandInHostOS(
          'tmp=$(mktemp)&&cat /mnt/boot/config.json | jq "del(.ntpServers)" > $tmp&&mv "$tmp" /mnt/boot/config.json',
          this.context.link,
        );
      },
    },
    {
      title: 'dnsServer test',
      run: async function(test) {
        const dnsServer = '8.8.4.4';

        const serverFile = await this.context.worker.executeCommandInHostOS(
          "systemctl show dnsmasq  | grep ExecStart | sed -n 's/.*--servers-file=\\([^ ]*\\)\\s.*$/\\1/p'",
          this.context.link,
        );

        test.is(
          (await this.context.worker.executeCommandInHostOS(
            `cat ${serverFile}`,
            this.context.link,
          )).trim(),
          'server=8.8.8.8',
        );

        await this.context.worker.executeCommandInHostOS(
          `tmp=$(mktemp)&&cat /mnt/boot/config.json | jq '.dnsServers="${dnsServer}"' > $tmp&&mv "$tmp" /mnt/boot/config.json`,
          this.context.link,
        );

        await rebootDevice(this);

        test.is(
          (await this.context.worker.executeCommandInHostOS(
            `cat ${serverFile}`,
            this.context.link,
          )).trim(),
          `server=${dnsServer}`,
        );

        await this.context.worker.executeCommandInHostOS(
          'tmp=$(mktemp)&&cat /mnt/boot/config.json | jq "del(.dnsServers)" > $tmp&&mv "$tmp" /mnt/boot/config.json',
          this.context.link,
        );
      },
    },
    {
      title: 'os.network.connectivity test',
      os: {
        type: 'object',
        required: ['version'],
        properties: {
          version: {
            type: 'string',
            semver: {
              gt: '2.34.0',
            },
          },
        },
      },
      run: async function(test) {
        const connectivity = {
          uri: 'http://www.archlinux.org/check_network_status.txt',
        };

        await this.context.worker.executeCommandInHostOS(
          `tmp=$(mktemp)&&cat /mnt/boot/config.json | jq '.os.network.connectivity=${JSON.stringify(
            connectivity,
          )}' > $tmp&&mv "$tmp" /mnt/boot/config.json`,
          this.context.link,
        );

        await rebootDevice(this);

        const config = await this.context.worker.executeCommandInHostOS(
          'NetworkManager --print-config | awk "/\\[connectivity\\]/{flag=1;next}/\\[/{flag=0}flag"',
          this.context.link,
        );

        test.is(
          /uri=(.*)\n/.exec(config)[1],
          connectivity.uri,
          `NetworkManager should be configured with uri: ${connectivity.uri}`,
        );

        await this.context.worker.executeCommandInHostOS(
          'tmp=$(mktemp)&&cat /mnt/boot/config.json | jq "del(.os.network.connectivity)" > $tmp&&mv "$tmp" /mnt/boot/config.json',
          this.context.link,
        );
      },
    },
    {
      title: 'os.network.wifi.randomMacAddressScan test',
      run: async function(test) {
        await this.context.worker.executeCommandInHostOS(
          `tmp=$(mktemp)&&cat /mnt/boot/config.json | jq '.os.network.wifi.randomMacAddressScan=true' > $tmp&&mv "$tmp" /mnt/boot/config.json`,
          this.context.link,
        );

        await rebootDevice(this);

        const config = await this.context.worker.executeCommandInHostOS(
          'NetworkManager --print-config | awk "/\\[device\\]/{flag=1;next}/\\[/{flag=0}flag"',
          this.context.link,
        );

        test.match(
          config,
          /wifi.scan-rand-mac-address=yes/,
          'NetworkManager should be configured to randomize wifi MAC',
        );

        await this.context.worker.executeCommandInHostOS(
          `tmp=$(mktemp)&&cat /mnt/boot/config.json | jq 'del(.os.network.wifi)' > $tmp&&mv "$tmp" /mnt/boot/config.json`,
          this.context.link,
        );
      },
    },
    {
      title: 'udevRules test',
      run: async function(test) {
        const rule = {
          99: 'ENV{ID_FS_LABEL_ENC}=="resin-boot", SYMLINK+="disk/test"',
        };

        await this.context.worker.executeCommandInHostOS(
          `tmp=$(mktemp)&&cat /mnt/boot/config.json | jq '.os.udevRules=${JSON.stringify(
            rule,
          )}' > $tmp&&mv "$tmp" /mnt/boot/config.json`,
          this.context.link,
        );

        await rebootDevice(this);

        test.is(
          await this.context.worker.executeCommandInHostOS(
            'readlink -e /dev/disk/test',
            this.context.link,
          ),
          await this.context.worker.executeCommandInHostOS(
            'readlink -e /dev/disk/by-label/resin-boot',
            this.context.link,
          ),
          'Dev link should point to the correct device',
        );

        await this.context.worker.executeCommandInHostOS(
          `tmp=$(mktemp)&&cat /mnt/boot/config.json | jq 'del(.os.udevRules)' > $tmp&&mv "$tmp" /mnt/boot/config.json`,
          this.context.link,
        );
      },
    },
    {
      title: 'sshKeys test',
      run: async function(test) {
        await test.resolves(
          this.context.worker.executeCommandInHostOS(
            'echo true',
            this.context.link,
          ),
          'Should be able to establish ssh connection to the device',
        );
      },
    },
  ],
};
