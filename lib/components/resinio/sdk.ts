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
import fs = require('fs')
import visuals = require('resin-cli-visuals')
const resin = require('resin-sdk')({
  apiUrl: 'https://api.resin.io/'
})

exports.downloadDeviceTypeOS = async (deviceType, version, destination) => {
  const stream = await resin.models.os.download(deviceType, version)
  if (!process.env.CI) {
    const bar = new visuals.Progress('Download')
    stream.on('progress', (data) => {
      bar.update({ percentage: data.percentage, eta: data.eta })
    })
  }

  return new Bluebird((resolve, reject) => {
    const output = fs.createWriteStream(destination)
    output.on('error', reject)
    stream.on('error', reject)
    stream.on('finish', resolve)
    stream.pipe(output)
  })
}

exports.getApplicationOSConfiguration = (application, options) => {
  return resin.models.os.getConfig(application, options)
}

exports.getDeviceOSConfiguration = async (uuid, apiKey, options) => {
  const application = await resin.models.device.getApplicationName(uuid)
  const configuration = await exports.getApplicationOSConfiguration(application, options)
  const device = await resin.models.device.get(uuid)

  configuration.registered_at = Math.floor(Date.now() / 1000)
  configuration.deviceId = device.id
  configuration.uuid = uuid
  configuration.deviceApiKey = apiKey
  return configuration
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

exports.createDevicePlaceholder = async (application) => {
  const applicationId = await resin.models.application.get(application).get('id')
  const uuid = await resin.models.device.generateUniqueKey()
  const deviceApiKey = await resin.models.device.generateUniqueKey()
  await resin.models.device.register(applicationId, uuid, deviceApiKey)
  return { uuid, deviceApiKey }
}

exports.waitForDevice = async (uuid, times = 0) => {
  const isOnline = await resin.models.device.isOnline(uuid)
  if (isOnline) {
    return uuid
  }

  if (times > 20) {
    throw new Error(`Device did not come online: ${uuid}`)
  }

  return Bluebird.delay(30000).then(() => {
    return exports.waitForDevice(uuid, times + 1)
  })
}
