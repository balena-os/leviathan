'use strict'

const _ = require('lodash')
const Bluebird = require('bluebird')
const fs = Bluebird.promisifyAll(require('fs'))
const mountutils = Bluebird.promisifyAll(require('mountutils'))
const drivelist = Bluebird.promisifyAll(require('drivelist'))
const imageWrite = require('etcher-image-write')

exports.writeImage = async (image, destination) => {
  const drive = _.find(await drivelist.listAsync(), {
    device: destination
  })

  if (!drive) {
    throw new Error(`The selected drive ${destination} was not found`)
  }

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
    console.log(`Flashing ${image}: ${state.percentage.toFixed(2)} (${state.type})`)
  })

  return new Bluebird((resolve, reject) => {
    emitter.once('error', reject)
    emitter.once('done', () => {
      resolve(drive.device)
    })
  }).then(() => {
    return fs.closeAsync(results.driveFileDescriptor)
      .delay(2000)
      .return(drive.device)
      .then(mountutils.unmountDiskAsync)
  })
}
