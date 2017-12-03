/*
 * Copyright 2017 resin.io
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

import Bluebird = require('bluebird')
import imageWrite = require('etcher-image-write')
import _ = require('lodash')
const fs = <any>Bluebird.promisifyAll(require('fs'))
const mountutils = <any>Bluebird.promisifyAll(require('mountutils'))
const drivelist = <any>Bluebird.promisifyAll(require('drivelist'))

exports.writeImage = async (image, destination) => {
  const drives = await drivelist.listAsync()
  const drive = <any>_.find(drives, {
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

  return new Bluebird((resolve, reject) => {
    emitter.once('error', reject)
    emitter.once('done', () => {
      resolve(drive.device)
    })
  }).then(() => {
    return fs.closeAsync(driveFileDescriptor)
      .delay(2000)
      .return(drive.device)
      .then(mountutils.unmountDiskAsync)
  })
}
