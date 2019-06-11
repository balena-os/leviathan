/*
 * Copyright 2017 balena
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

const assignIn = require('lodash/assignIn');
const split = require('lodash/split');

const Bluebird = require('bluebird');
const imagefs = require('resin-image-fs');
const path = require('path');
const fs = Bluebird.promisifyAll(require('fs'));
const { join } = require('path');
const unzip = require('unzip');

const utils = require('../../common/utils');
const Balena = require('../balena/sdk');

// TODO: This function should be implemented using Reconfix
const injectBalenaConfiguration = (image, configuration) => {
  return imagefs.writeFile(
    {
      image,
      partition: 1,
      path: '/config.json'
    },
    JSON.stringify(configuration)
  );
};

// TODO: This function should be implemented using Reconfix
const injectNetworkConfiguration = (image, configuration) => {
  if (configuration == null || configuration.type === 'ethernet') {
    return Bluebird.resolve();
  }

  const wifiConfiguration = [
    '[connection]',
    'id=balena-wifi',
    'type=wifi',
    '[wifi]',
    'hidden=true',
    'mode=infrastructure',
    `ssid=${configuration.wifiSsid}`,
    '[ipv4]',
    'method=auto',
    '[ipv6]',
    'addr-gen-mode=stable-privacy',
    'method=auto'
  ];

  if (configuration.wifiKey) {
    Reflect.apply(wifiConfiguration.push, wifiConfiguration, [
      '[wifi-security]',
      'auth-alg=open',
      'key-mgmt=wpa-psk',
      `psk=${configuration.wifiKey}`
    ]);
  }

  return imagefs.writeFile(
    {
      image,
      partition: 1,
      path: '/system-connections/balena-wifi'
    },
    wifiConfiguration.join('\n')
  );
};

module.exports = class BalenaOS {
  constructor(options = {}) {
    this.deviceType = options.deviceType;
    this.network = options.network;
    this.image = {};
    this.configJson = {};
  }

  unpack(download) {
    const types = {
      jenkins: async () => {
        const supervisorVersion = await fs.readFileAsync(path.join(download.source, 'VERSION'));
        const version = await fs.readFileAsync(path.join(download.source, 'VERSION_HOSTOS'));

        return {
          version,
          stream: fs
            .createReadStream(path.join(download.source, 'resin.img.zip'))
            .pipe(unzip.Parse()),
          filename: `balena-${this.deviceType}-${version}-v${supervisorVersion}.img`
        };
      },
      imageMaker: async () => {
        const sdk = new Balena(download.source);
        const version = await sdk.getMaxSatisfyingVersion(this.deviceType, download.version);

        if (version == null) {
          throw new Error(`Could not find version ${download.version} for ${this.deviceType}`);
        }

        const stream = await sdk.getDownloadStream(this.deviceType, version);

        const filename = split(stream.response.headers._headers['content-disposition'][0], '"')[1];

        return {
          version,
          filename,
          stream
        };
      },
      local: async () => {
        const version = /VERSION="(.*)"/g.exec(
          await imagefs.readFile({
            image: join('/mnt', download.source),
            partition: 1,
            path: '/os-release'
          })
        );
        const variant = /VARIANT_ID="(.*)"/g.exec(
          await imagefs.readFile({
            image: join('/mnt', download.source),
            partition: 1,
            path: '/os-release'
          })
        );

        if (!version) {
          throw new Error('Could not find OS version on the image.');
        }

        return {
          version: version && variant ? `${version[1]}.${variant[1]}` : null,
          filename: null,
          stream: fs.createReadStream(join('/mnt', download.source))
        };
      }
    };

    return types[download.type]();
  }

  async fetch(destination, download) {
    console.log('Fetching Operating System...');
    this.image.path = join(destination, 'balena.img');

    const { version, filename, stream } = await this.unpack(download);

    this.image.version = version;
    this.image.filename = filename;

    return utils.promiseStream(stream.pipe(fs.createWriteStream(this.image.path)));
  }

  addCloudConfig(configJson) {
    assignIn(this.configJson, configJson);
  }

  async configure() {
    console.log(`Configuring balenaOS image: ${this.image.path}`);

    if (this.configJson) {
      await injectBalenaConfiguration(this.image.path, this.configJson);
    }
    await injectNetworkConfiguration(this.image.path, this.network);
  }
};
