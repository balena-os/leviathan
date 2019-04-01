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

const forEach = require('lodash/forEach');

const Bluebird = require('bluebird');
const Board = require('firmata');
const { fs } = require('mz');
const retry = require('bluebird-retry');
const visuals = require('resin-cli-visuals');
const sdk = require('etcher-sdk');
const { getDrive } = require('../common/utils');

const WRITE_DAC_REG = 0x00;
const ENABLE_VOUT_SW = 0x03;
const DISABLE_VOUT_SW = 0x04;
const ENABLE_VREG = 0x07;
const ENABLE_FAULTRST = 0x10;
const SD_RESET_ENABLE = 0x12;
const SD_RESET_DISABLE = 0x13;

const LED_PIN = 13;
const HW_SERIAL5 = 5;
const SD_MUX_SEL_PIN = 28;
const USB_MUX_SEL_PIN = 29;

const DEV_ID_LINK = '/dev/disk/by-id/usb-PTX_sdmux_HS-SD_MMC_1234-0:0';

const manageHandlers = (worker, options) => {
  const action = options.register ? 'once' : 'removeListener';
  forEach(['SIGINT', 'SIGTERM'], signal => {
    process[action](signal, worker.signalOff);
  });
};

module.exports = class TestBotWorker {
  /**
   * Represents a TestBotWorker
   * @constructor
   * @param {String} title - Name of the worker
   * @param {String} deviceType - The device type this worker is controlling
   * @param {Object} [options={}] - Extra options to configure the worker
   */

  constructor(title, deviceType, options = {}) {
    this.title = title;
    this.deviceType = deviceType;
    this.options = options;
    this.board = new Board(this.options.devicePath, {
      serialPort: {
        portId: HW_SERIAL5,
        baud: 9600
      }
    });
  }

  /**
   * Get dev interface of the SD card
   * @function
   * @param {String} devicePath - This is not used if linux is the host OS
   *
   * @returns {String} path to the dev interface
   */

  async getDevInterface() {
    const RETRIES = 5;
    const DELAY = 5000;
    const deviceInterface = process.platform === 'linux' ? DEV_ID_LINK : this.options.devicePath;

    return retry(
      () => {
        return fs.realpathAsync(deviceInterface);
      },
      {
        max_tries: RETRIES,
        interval: DELAY,
        throw_original: true
      }
    );
  }

  /**
   * Send an array of bytes over the selected serial port
   * @function
   * @param {Number} command - First byte (i.e. pin to write)
   * @param {Number} a_ - Second byte
   * @param {Number} b_ - Third byte
   */

  sendCommand(command, a_ = 0, b_ = 0) {
    if (!this.board.isReady) {
      throw new Error('Board is not marked as ready.');
    }

    this.board.serialWrite(HW_SERIAL5, [command, a_, b_]);
  }

  /**
   * Connected the SD card interface to the target
   * @function
   *
   * @returns Wait time for the firmware to write the serial
   */

  async switchSdToTarget() {
    if (!this.board.isReady) {
      throw new Error('Board is not marked as ready.');
    }

    this.sendCommand(SD_RESET_ENABLE);

    // Allow some time to write to serial
    await Bluebird.delay(10);
    this.sendCommand(SD_RESET_DISABLE);

    this.board.digitalWrite(LED_PIN, this.board.LOW);
    this.board.digitalWrite(SD_MUX_SEL_PIN, this.board.LOW);

    return Bluebird.delay(5000);
  }

  /**
   * Connected the SD card interface to the host
   * @function
   *
   * @returns Wait time for the firmware to write the serial
   */

  async switchSdToHost() {
    if (!this.board.isReady) {
      throw new Error('Board is not marked as ready.');
    }

    this.sendCommand(SD_RESET_ENABLE);

    // Allow some time to write to serial
    await Bluebird.delay(10);
    this.sendCommand(SD_RESET_DISABLE);

    this.board.digitalWrite(LED_PIN, this.board.HIGH);
    this.board.digitalWrite(SD_MUX_SEL_PIN, this.board.HIGH);

    return Bluebird.delay(5000);
  }

  /**
   * Power target board on
   * @function
   */

  powerTarget() {
    if (!this.board.isReady) {
      throw new Error('Board is not marked as ready.');
    }

    this.sendCommand(ENABLE_VOUT_SW);
  }

  /**
   * Power off target board
   * @function
   */

  powerOffTarget() {
    if (!this.board.isReady) {
      throw new Error('Board is not marked as ready.');
    }

    this.sendCommand(DISABLE_VOUT_SW);
  }

  /**
   * Flash SD card with operating system
   * @function
   * @param {Object} - Operating system instance to be used
   */

  async flash(os) {
    await os.configure();

    if (!this.board.isReady) {
      throw new Error('Board is not marked as ready.');
    }

    await this.off();

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

  /**
   * Get TestBot ready to function
   * @function
   */

  async ready() {
    await new Bluebird((resolve, reject) => {
      this.board.once('ready', () => {
        resolve();
      });
      this.board.once('error', reject);
    });

    this.board.pinMode(LED_PIN, this.board.MODES.OUTPUT);

    // Power managment configuration
    // We set the regulator (DAC_REG) to 5V and start the managment unit (VREG)
    this.sendCommand(ENABLE_FAULTRST);
    await Bluebird.delay(1000);
    this.sendCommand(WRITE_DAC_REG, 5);
    await Bluebird.delay(1000);
    this.sendCommand(ENABLE_VREG);
    await Bluebird.delay(1000);

    // SD card managment configuration
    // We enable the SD/USB multiplexers and leave them disconnected
    this.board.pinMode(SD_MUX_SEL_PIN, this.board.MODES.OUTPUT);
    this.board.digitalWrite(SD_MUX_SEL_PIN, this.board.LOW);
    this.board.pinMode(USB_MUX_SEL_PIN, this.board.MODES.OUTPUT);
    this.board.digitalWrite(USB_MUX_SEL_PIN, this.board.LOW);
  }

  /**
   * Turn target board on
   * @function
   */

  async on() {
    if (!this.board.isReady) {
      throw new Error('Board is not marked as ready.');
    }

    console.log('Switching SD card to device...');
    await this.switchSdToTarget();

    console.log('Switching testbot on...');
    this.powerTarget();

    this.signalOff = this.signalOff.bind(this);

    manageHandlers(this, {
      register: true
    });
  }

  /**
   * Turn target board off
   * @function
   */

  async off() {
    if (!this.board.isReady) {
      this.board.transport.close();
      throw new Error('Board is not marked as ready.');
    }

    console.log('Switching SD card to host...');
    await this.switchSdToHost();

    console.log('Switching testbot off...');
    this.powerOffTarget();
    this.board.transport.close();

    manageHandlers(this, {
      register: false
    });
  }

  /**
   * Turn worker off based on signal received
   * @function
   * @param {String} signal - Signal received
   *
   */

  async signalOff(signal) {
    await this.off();
    process.kill(process.pid, signal);
  }
};
