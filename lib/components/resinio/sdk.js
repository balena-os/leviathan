'use strict'

const fs = require('fs')
const Bluebird = require('bluebird')
const progressStream = require('progress-stream')
const resin = require('resin-sdk')({
  apiUrl: 'https://api.resin.io/'
})

exports.downloadDeviceTypeOS = (deviceType, version, destination) => {
  return Bluebird.props({
    stream: resin.models.os.download(deviceType, version),
    size: resin.models.os.getDownloadSize(deviceType, version)
  }).then((results) => {
    return new Bluebird((resolve, reject) => {
      const output = fs.createWriteStream(destination)
      output.on('error', reject)

      const progress = progressStream({
        length: results.size,
        time: 1000
      })

      progress.on('error', reject)
      progress.on('progress', (data) => {
        console.log(`Downloading OS: ${data.percentage.toFixed(2)}%`)
      })

      results.stream.on('error', reject)
      results.stream.on('finish', resolve)
      results.stream.pipe(output)
    })
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
  return resin.models.application.remove(application)
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
