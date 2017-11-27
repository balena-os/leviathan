'use strict'

const Bluebird = require('bluebird')

exports.provision = async (writer, imagePath, options) => {
  await writer.writeImage(imagePath, options.destination)
  console.log(`Write complete. Please remove ${options.destination}, plug it into the device, and turn it on.`)
  return new Bluebird((resolve) => {
    console.log('Press any key to continue.')
    process.stdin.once('data', resolve)
  })
}
