'use strict'

import Bluebird = require('bluebird')
import imageWrite = require('etcher-image-write')
import _ = require('lodash')
const fs = Bluebird.promisifyAll(require('fs'))
const mountutils = Bluebird.promisifyAll(require('mountutils'))
const drivelist = Bluebird.promisifyAll(require('drivelist'))

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
