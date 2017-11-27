'use strict'

import Bluebird = require('bluebird')
import fs = require('fs')
import progressStream = require('progress-stream')
const resin = require('resin-sdk')({
  apiUrl: 'https://api.resin.io/'
})

exports.downloadDeviceTypeOS = async (deviceType, version, destination) => {
  const stream = await resin.models.os.download(deviceType, version)
  const size = await resin.models.os.getDownloadSize(deviceType, version)

  return new Bluebird((resolve, reject) => {
    const output = fs.createWriteStream(destination)
    output.on('error', reject)

    const progress = progressStream({
      length: size,
      time: 1000
    })

    progress.on('error', reject)
    progress.on('progress', (data) => {
      console.log(`Downloading OS for ${deviceType} (${version}): ${data.percentage.toFixed(2)}%`)
    })

    stream.on('error', reject)
    stream.on('finish', resolve)
    stream.pipe(progress).pipe(output)
  })
}

exports.getApplicationOSConfiguration = (application, options) => {
  return resin.models.os.getConfig(application, options)
}

exports.getApplicationGitRemote = (application) => {
  return resin.models.application.get(application).get('git_repository')
}

exports.loginWithCredentials = (credentials) => {
  return resin.auth.login(credentials)
}

exports.hasApplication = (application) => {
  return resin.models.application.has(application)
}

exports.removeApplication = (application) => {
  return exports.hasApplication(application).then((hasApplication) => {
    if (hasApplication) {
      return resin.models.application.remove(application)
    }

    return Bluebird.resolve()
  })
}

exports.createApplication = (name, deviceType) => {
  return resin.models.application.create(name, deviceType)
}

exports.getApplicationDevices = (application) => {
  return resin.models.device.getAllByApplication(application).map((device) => {
    return device.id
  })
}

exports.isDeviceOnline = (device) => {
  return resin.models.device.isOnline(device)
}

exports.getDeviceHostOSVersion = (device) => {
  return resin.models.device.get(device).get('os_version')
}

exports.getDeviceCommit = (device) => {
  return resin.models.device.get(device).get('commit')
}
