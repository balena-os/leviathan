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

const Bluebird = require('bluebird');
const retry = require('bluebird-retry');
const utils = require('../common/utils');
const config = require('config');
const isNumber = require('lodash/isNumber');
const { fs } = require('mz');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const request = require('request');
const rp = require('request-promise');
const { Spinner, Progress } = require('./visuals');

module.exports = class Worker {
  constructor(deviceType) {
    this.deviceType = deviceType;
    this.url = `${config.get('worker.url')}:${config.get('worker.port')}`;
  }

  flash(os) {
    return new Promise(async (resolve, reject) => {
      await os.configure();

      const spinner = new Spinner('Preparing flash');
      let singleton = false;
      spinner.start();

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
            const state = JSON.parse(computedLine[2]);
            if (state != null && isNumber(state.percentage)) {
              if (!singleton) {
                spinner.stop();
                singleton ^= true;
              }
              progress.update(state);
            }
          }

          if (computedLine[1] === 'status') {
            lastStatus = computedLine[2];
          }
        }
      });

      await pipeline(fs.createReadStream(os.image.path), req);
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

  proxy(proxy) {
    return rp.post({ uri: `${this.url}/proxy`, body: proxy, json: true });
  }

  ip(
    target,
    timeout = {
      interval: 10000,
      tries: 60
    }
  ) {
    return /.*\.local/.test(target)
      ? retry(
          () => {
            return rp.get({ uri: `${this.url}/dut/ip`, body: { target }, json: true });
          },
          {
            max_tries: timeout.tries,
            interval: timeout.interval,
            throw_original: true
          }
        )
      : target;
  }

  async teardown() {
    await rp.post({ uri: `${this.url}/teardown`, json: true });
  }

  capture(action) {
    switch (action) {
      case 'start':
        return rp.post({ uri: `${this.url}/dut/capture`, json: true });
      case 'stop':
        return request.get({ uri: `${this.url}/dut/capture` });
    }
  }

  async executeCommandInHostOS(
    command,
    target,
    timeout = {
      interval: 10000,
      tries: 60
    }
  ) {
    let ip = /.*\.local/.test(target) ? await this.ip(target) : target;

    return retry(
      async () => {
        const result = await utils.executeCommandOverSSH(`source /etc/profile ; ${command}`, {
          host: ip,
          port: '22222',
          username: 'root'
        });

        if (typeof result.code === 'number' && result.code !== 0) {
          throw new Error(
            `"${command}" failed. stderr: ${result.stderr}, stdout: ${result.stdout}, code: ${result.code}`
          );
        }

        return result.stdout;
      },
      {
        max_tries: timeout.tries,
        interval: timeout.interval,
        throw_original: true
      }
    );
  }
};
