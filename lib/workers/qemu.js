/*
 * Copyright 2018 resin.io
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

'use strict'

const childProcess = require('child_process')

const childKillEventHandler = (child, event) => {
  process.on(event, (code) => {
    child.kill()
    process.exit(code || 0)
  })
}

module.exports = class QEMUWorker {
  constructor (title, deviceType, options = {}) {
    this.title = title
    this.deviceType = deviceType
    this.options = options
  }

  // eslint-disable-next-line class-methods-use-this
  async ready (os) {
    console.log('Worker is ready')
  }

  async flash (os) {
    await os.configure()

    console.log(`Flashing ${os.image}`)
    this.image = os.image
  }

  async on () {
    console.log('Starting qemu machine...')

    // TODO: Execute different QEMU versions
    // depending on the given device type
    this.child = childProcess.spawn('qemu-system-x86_64', [
      '-drive', `file=${this.image},media=disk,cache=none,format=raw`,
      '-net', 'nic,model=virtio',
      '-net', 'user',
      '-m', '512',
      '-nographic',
      '-machine', 'type=pc,accel=kvm',
      '-smp', '4'
    ])

    childKillEventHandler(this.child, 'exit')
    childKillEventHandler(this.child, 'uncaughtException')
    childKillEventHandler(this.child, 'unhandledRejection')
  }

  async off () {
    return this.child.kill()
  }
}
