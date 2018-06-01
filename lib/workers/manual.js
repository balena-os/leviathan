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

const Bluebird = require('bluebird')
const imageWrite = require('etcher-image-write')
const _ = require('lodash')
const fs = Bluebird.promisifyAll(require('fs'))
const mountutils = Bluebird.promisifyAll(require('mountutils'))
const drivelist = Bluebird.promisifyAll(require('drivelist'))

module.exports = class ManualWorker {
  constructor (title, deviceType, options = {}) {
    this.title = title
    this.deviceType = deviceType
    this.options = options
  }

  // eslint-disable-next-line class-methods-use-this
  async ready () {
    return Bluebird.resolve()
  }

  async flash (image) {
    const drives = await drivelist.listAsync()
    const destination = this.options.devicePath
    const drive = _.find(drives, {
      device: destination
    })

    if (!drive) {
      throw new Error(`The selected drive ${destination} was not found`)
    }

    await mountutils.unmountDiskAsync(drive.device)
    const driveFileDescriptor = await fs.openAsync(drive.raw, 'rs+')
    const imageSize = await fs.statAsync(image).get('size')

    const emitter = imageWrite.write({
      fd: driveFileDescriptor,
      device: drive.raw,
      size: drive.size
    }, {
      stream: fs.createReadStream(image),
      size: imageSize
    }, {
      check: true
    })

    emitter.on('progress', (state) => {
      console.log(`Flashing ${image}: ${state.percentage.toFixed(2)}% (${state.type})`)
    })

    await new Bluebird((resolve, reject) => {
      emitter.once('error', reject)
      emitter.once('done', () => {
        resolve(drive.device)
      })
    })

    await fs.closeAsync(driveFileDescriptor).delay(2000)
    await mountutils.unmountDiskAsync(drive.device)
    console.log('Write complete. Please remove the drive')
  }

  async on () {
    console.log(`Please plug ${this.options.devicePath} into the device and turn it on`)
  }

  // eslint-disable-next-line class-methods-use-this
  async off () {
    console.log('Please turn off the device')
  }
}
