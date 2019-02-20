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
const childProcess = require('child_process');

const manageHandlers = (worker, options) => {
  const action = options.register ? 'once' : 'removeListener';
  process[action]('exit', worker.exitFunc);
  forEach(['SIGINT', 'SIGTERM'], signal => {
    process[action](signal, worker.signalFunc);
  });
};

module.exports = class QEMUWorker {
  constructor(title, deviceType, options = {}) {
    this.title = title;
    this.deviceType = deviceType;
    this.options = options;
  }

  // These functions need to be named so we can later remove the listeners
  exitFunc(code) {
    this.child.kill();
    if (code !== 0) {
      process.exitCode = code;
    }
  }

  signalFunc(signal) {
    this.child.kill();
    process.kill(process.pid, signal);
  }

  // eslint-disable-next-line class-methods-use-this
  async ready(os) {
    console.log('Worker is ready');
  }

  async flash(os) {
    await os.configure();

    console.log(`Flashing ${os.image.path}`);
    this.image = os.image.path;
  }

  async on() {
    console.log('Starting qemu machine...');

    let stderr = '';

    // TODO: Execute different QEMU versions
    // depending on the given device type
    this.child = childProcess.spawn('qemu-system-x86_64', [
      '-drive',
      `file=${this.image},media=disk,cache=none,format=raw`,
      '-net',
      'nic,model=virtio',
      '-net',
      'user',
      '-m',
      '512',
      '-nographic',
      '-machine',
      'type=pc,accel=kvm',
      '-smp',
      '4'
    ]);

    this.child.stderr.on('data', data => {
      stderr += data;
    });

    this.child.on('close', code => {
      if (stderr !== '') {
        console.error(`QEMU error: ${stderr}`);
      }

      if (code !== 0 && code !== null) {
        throw new Error(`QEMU exit code: ${code}`);
      }
    });

    this.exitFunc = this.exitFunc.bind(this);
    this.signalFunc = this.signalFunc.bind(this);

    manageHandlers(this, {
      register: true
    });
  }

  async off() {
    manageHandlers(this, {
      register: false
    });
    return this.child.kill();
  }
};
