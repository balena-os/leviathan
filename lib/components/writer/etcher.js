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

const Bluebird = require('bluebird')
const imageWrite = require('etcher-image-write')
const _ = require('lodash')
const fs = Bluebird.promisifyAll(require('fs'))
const mountutils = Bluebird.promisifyAll(require('mountutils'))
const drivelist = Bluebird.promisifyAll(require('drivelist'))
const visuals = require('resin-cli-visuals')

exports.writeImage = async (image, destination) => {
  const drives = await drivelist.listAsync()
  const drive = _.find(drives, {
    device: destination
  })

  if (!drive) {
    throw new Error(`The selected drive ${destination} was not found`)
  }

  await mountutils.unmountDiskAsync(drive.device)
  const driveFileDescriptor = await fs.openAsync(drive.raw, 'rs+')
  const imageSize = await fs.statAsync(image).get('size')

  const stream = imageWrite.write({
    fd: driveFileDescriptor,
    device: drive.raw,
    size: drive.size
  }, {
    stream: fs.createReadStream(image),
    size: imageSize
  }, {
    check: true
  })

  const bar = new visuals.Progress('')

  let report = (data) => {
    if (Math.floor(data.percentage) % 5 === 0) {
      console.log(`Flashing ${image}: ${data.percentage.toFixed(2)}% (${data.type})`)
    }
  }

  if (!process.env.CI) {
    report = (data) => {
      const message = `Flashing ${image} to ${drive.device}`

      bar.update({
        message: `${message} (${data.type})`,
        percentage: data.percentage,
        eta: data.eta
      })
    }
  }

  stream.on('progress', (data) => {
    report(data)
  })

  return new Bluebird((resolve, reject) => {
    stream.once('error', reject)
    stream.once('done', () => {
      resolve(drive.device)
    })
  }).then(() => {
    return fs.closeAsync(driveFileDescriptor)
      .delay(2000)
      .return(drive.device)
      .then(mountutils.unmountDiskAsync)
  })
}
