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
  title: 'TC25 - SOCKS proxy test',
  interactive: true,
  run: async function(context) {
    this.resolveMatch(
      context.utils.runManualTestCase({
        prepare: ['On your development machine run:', '\tglider -listen :8123 -verbose'],
        do: [
          'On your balena device:',
          "\tcat <<'EOF'>> /mnt/boot/system-proxy/redsocks.conf",
          '\tmkdir -p /mnt/boot/system-proxy/',
          '\tbase {',
          '\tlog_debug = off;',
          '\tlog_info = on;',
          '\tlog = stderr;',
          '\tdaemon = off;',
          '\tredirector = iptables;',
          '\t},',

          '\tredsocks {,',
          '\ttype = socks5;',
          '\tip = <SERVER IP>;',
          '\tport = 8123;',
          '\tlocal_ip = 127.0.0.1;',
          '\tlocal_port = 12345;',
          '\t},',

          '\tEOF',
          '\tsource /etc/profile && reboot',
          'Wait until the glider server connects the device.'
        ],
        assert: [
          'The proxy server should produce a line as such: 2018/04/10 10:48:01 proxy-https 127.0.0.1:36624 <-> 159.122.19.148:80',
          'Device should appear online in the dashboard'
        ],
        cleanup: [
          'On your balena device:',
          '\tsource /etc/profile && rm -rf /mnt/boot/system-proxy && reboot'
        ]
      }),
      true
    );
  }
};
