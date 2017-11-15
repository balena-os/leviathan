'use strict'

const _ = require('lodash')
const imageWriter = require('etcher-image-write')
const Bluebird = require('bluebird')
const mountutils = Bluebird.promisifyAll(require('mountutils'))
const bar = require('cli-progress')
const drivelist = require('drivelist')
const fs = require('fs')
const path = require('path')
const sdk = require('../components/resinio/sdk')
const resinos = require('../components/resinos/simple')
const os = require('os')

const ASSETS_DIRECTORY = os.tmpdir()

const validateDisk = (disk) => {
  return drivelist.listAsync()
    .then((disks) => {
      const result = _.find(disks, {
        device: disk
      })

      if (typeof result === 'undefined') {
        throw new Error(`The selected drive ${disk} was not found`)
      } else {
        return result.device
      }
    })
}

const writeImage = (disk) => {
  const write = new bar.Bar({}, bar.Presets.shades_classic)
  let fd = null

  return Bluebird.try(() => {
    return mountutils.unmountDiskAsync(disk)
  }).then(() => {
    return fs.openAsync(disk, 'rs+')
  }).then((driveFileDescriptor) => {
    fd = driveFileDescriptor
    return imageWriter.write({
      fd,
      device: disk,
      size: 2014314496
    },
    {
      stream: fs.createReadStream(path.join(ASSETS_DIRECTORY, 'resin.img')),
      size: fs.statSync(path.join(ASSETS_DIRECTORY, 'resin.img')).size
    },
    {
      check: false
    })
  }).then((emitter) => {
    return new Bluebird((resolve, reject) => {
      write.start(100, 0)
      emitter.on('progress', (state) => {
        write.update(state.percentage.toFixed(2))
      })

      emitter.on('error', reject)
      emitter.on('done', (results) => {
        console.log(results)
        write.stop()
        resolve()
      })
    })
  }).tap(() => {
    return fs.closeAsync(fd).then(() => {
      return Bluebird.delay(2000)
        .return(disk)
        .then(mountutils.unmountDiskAsync)
    })
  })
}

exports.provision = (appName, deviceType, version, disk, config) => {
  const imagePath = path.join(ASSETS_DIRECTORY, 'resin.img')
  return sdk.downloadDeviceTypeOS(deviceType, version, imagePath).then(() => {
    return sdk.getApplicationOSConfiguration(appName, config)
  }).then((conf) => {
    return resinos.injectResinConfiguration(imagePath, conf).then(() => {
      return resinos.injectNetworkConfiguration(imagePath, config)
    })
  }).then(() => {
    return validateDisk(disk)
  }).then(writeImage)
}
