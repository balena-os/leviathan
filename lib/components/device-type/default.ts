'use strict'

const Bluebird = require('bluebird')

exports.provision = (writer, imagePath, options) => {
  return writer.writeImage(imagePath, options.destination).then(() => {
    console.log(`Write complete. Please remove ${options.destination}, plug it into the device, and turn it on.`)

    return new Bluebird((resolve) => {
      console.log('Press any key to continue.')
      process.stdin.once('data', resolve)
    })
  })
}
