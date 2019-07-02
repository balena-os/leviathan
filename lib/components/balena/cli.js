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

const Bluebird = require('bluebird');
const { spawn, exec } = require('mz/child_process');

module.exports = class CLI {
  preload(image, options) {
    return exec(
      `balena preload --app ${options.app} --commit ${options.commit} --pin-device-to-release ${
        options.pin
      } ${image}`
    );
  }
  push(target, options) {
    return exec(`balena push ${target} --source ${options.source}`);
  }
  loginWithToken(token) {
    return exec(`balena login --token ${token}`);
  }
  tunnel(target, mappings) {
    return new Bluebird(function(resolve, reject) {
      let stderr = '';

      const args = mappings.reduce(
        (acc, elem) => {
          return acc.concat(elem, '-p');
        },
        ['-p']
      );
      args.pop();

      const timeout = setTimeout(() => {
        reject(`Tunnel error, stderr: ${stderr}`);
      }, 5000);

      const child = spawn('balena', ['tunnel', target, ...args], {
        stdio: 'pipe'
      });

      child.on('close', code => {
        if (stderr !== '') {
          console.error(`Tunnel error: ${stderr}`);
        }

        if (code != null && code !== 0) {
          reject(new Error(`Tunnel exit code: ${code}`));
        }
      });

      child.stderr.on('data', data => {
        stderr += data;
      });

      child.stdout.on('data', data => {
        if (/.*Waiting for connections\.\.\..*/.test(data.toString('utf-8'))) {
          clearTimeout(timeout);
          resolve(child);
        }
      });
    });
  }
};
