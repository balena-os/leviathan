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

const { fs } = require('mz');
const { promiseStream } = require('./utils');
const { basename } = require('path');
const { Progress } = require('resin-cli-visuals');
const rp = require('request-promise');
const Zip = require('node-zip');

module.exports = class Worker {
  constructor(deviceType, url) {
    this.deviceType = deviceType;
    this.url = url;
  }

  flash(os) {
    const zip = new Zip();

    return new Promise(async (resolve, reject) => {
      await os.configure();

      console.log('Zipping image for upload');
      const archivePath = `${os.image.path}.zip`;
      zip.file(basename(os.image.path), await fs.readFile(os.image.path));
      const data = zip.generate({ base64: false, compression: 'DEFLATE' });
      await fs.writeFile(archivePath, data, 'binary');

      const progress = new Progress('Flashing image');

      const req = rp.post({ uri: `${this.url}/dut/flash` });

      req.catch(error => {
        reject(error);
      });
      req.finally(() => {
        if (lastStatus !== 'done') {
          reject(new Error('Unexpected end of TCP connection'));
        }

        resolve();
      });

      let lastStatus;
      req.on('data', data => {
        const computedLine = RegExp('(.*): (.*)').exec(data.toString());

        if (computedLine) {
          if (computedLine[1] === 'error') {
            req.cancel();
            reject(new Error(computedLine[2]));
          }

          if (computedLine[1] === 'progress') {
            // Hide any errors as the lines we get can be half written
            try {
              progress.update(JSON.parse(computedLine[2]));
            } catch (err) {}
          }

          if (computedLine[1] === 'status') {
            lastStatus = computedLine[2];
          }
        }
      });

      await promiseStream(fs.createReadStream(archivePath).pipe(req));
    });
  }

  async select(worker) {
    await rp.post({ uri: `${this.url}/select`, body: worker, json: true });
  }

  async on() {
    await rp.post(`${this.url}/dut/on`);
  }

  async off() {
    await rp.post(`${this.url}/dut/off`);
  }

  async network(network) {
    await rp.post({ uri: `${this.url}/dut/network`, body: network, json: true });
  }
};
