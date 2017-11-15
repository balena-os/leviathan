'use strict'

const _ = require('lodash')
const Bluebird = require('bluebird')
const fs = Bluebird.promisifyAll(require('fs'))
const mountutils = Bluebird.promisifyAll(require('mountutils'))
const drivelist = Bluebird.promisifyAll(require('drivelist'))
const imageWrite = require('etcher-image-write')

exports.writeImage = (image, destination) => {
  return drivelist.listAsync().then((drives) => {
    const drive = _.find(drives, {
      device: destination
    })

    if (!drive) {
      throw new Error(`The selected drive ${destination} was not found`)
    }

    return drive
  }).then((drive) => {
    return Bluebird.props({
      driveFileDescriptor: fs.openAsync(drive.raw, 'rs+'),
      imageSize: fs.statAsync(image).get('size')
    }).then((results) => {
      const emitter = imageWrite.write({
        fd: results.driveFileDescriptor,
        device: drive.raw,
        size: drive.size
      }, {
        stream: fs.createReadStream(image),
        size: results.imageSize
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
    })
  })
}
