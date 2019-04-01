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
const fs = Bluebird.promisifyAll(require('fs'));
const visuals = require('resin-cli-visuals');
const sdk = require('etcher-sdk');
const { getDrive } = require('../common/utils');

module.exports = class ManualWorker {
  constructor(title, deviceType, options = {}) {
    this.title = title;
    this.deviceType = deviceType;
    this.options = options;
  }

  // eslint-disable-next-line class-methods-use-this
  async ready() {
    console.log('Worker is ready');
  }

  async flash(os) {
    await os.configure();

    console.log(`Flashing ${os.image.path}`);

    const source = await new sdk.sourceDestination.StreamZipSource(
      new sdk.sourceDestination.SingleUseStreamSource(fs.createReadStream(os.image.path))
    );
    // For linux, udev will provide us with a nice id for the testbot
    const drive = await getDrive(await this.getDevInterface());

    const progressBar = {
      flashing: new visuals.Progress('Flashing'),
      verifying: new visuals.Progress('Validating')
    };

    await sdk.multiWrite.pipeSourceToDestinations(
      source,
      [drive],
      (_destination, error) => {
        console.error(error);
      },
      progress => {
        progressBar[progress.type].update(progress);
      },
      true
    );
  }

  async on() {
    console.log(`Please plug ${this.options.devicePath} into the device and turn it on`);
  }

  // eslint-disable-next-line class-methods-use-this
  async off() {
    console.log('Please turn off the device');
  }
};
