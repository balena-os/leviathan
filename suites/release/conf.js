/*
 * Copyright 2018 balena
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

const randomstring = require('randomstring');
const path = require('path');

const id = `${path.basename(__dirname)}_${randomstring.generate({
  length: 5,
  charset: 'alphabetic'
})}`;

module.exports = options => {
  return {
    balenaOS: {
      config: {
        hostname: id
      },
      download: {
        type: options.BALENA_TESTS_DOWNLOAD_TYPE,
        version: options.BALENA_TESTS_DOWNLOAD_VERSION,
        source: options.BALENA_TESTS_DOWNLOAD_SOURCE
      },
      network: {
        wifi: {
          ssid: options.BALENA_TESTS_WIFI_SSID,
          key: options.BALENA_TESTS_WIFI_KEY
        }
      }
    },
    balena: {
      application: {
        name: id,
        env: {
          delta: options.BALENA_TESTS_SUPERVISOR_DELTA || false
        }
      },
      sshKeyLabel: id,
      apiKey: options.BALENA_TESTS_API_KEY,
      apiUrl: options.BALENA_TESTS_API_URL
    },
    worker: {
      url: options.BALENA_TESTS_WORKER_URL,
      type: options.BALENA_TESTS_WORKER_TYPE
    }
  };
};
