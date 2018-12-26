/*
 * Copyright 2018 balena
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

const randomstring = require('randomstring')

const utils = require('../common/utils')
const Balena = utils.requireComponent('balena', 'sdk')

const testID = randomstring.generate({
  length: 5,
  charset: 'alphabetic'
})

module.exports = async (options) => {
  const balena = new Balena(options.BALENA_TESTS_API_STAGING_URL)
  const supported = await balena.getAllSupportedOSVersions(options.BALENA_TESTS_DEVICE_TYPE)

  const conf = {
    deviceType: options.BALENA_TESTS_DEVICE_TYPE,
    balenaOSVersion: `${await utils.resolveVersion(supported, options.BALENA_TESTS_BALENA_VERSION)}`,
    balenaOSVersionUpdate: `${await utils.resolveVersion(supported, options.BALENA_TESTS_BALENA_VERSION_UPDATE)}`,
    applicationName: `${options.BALENA_TESTS_APPLICATION_NAME}_${testID}`,
    device: options.BALENA_TESTS_DEVICE,
    apiKey: options.BALENA_TESTS_API_KEY,
    email: options.BALENA_TESTS_EMAIL,
    password: options.BALENA_TESTS_PASSWORD,
    tmpdir: options.BALENA_TESTS_TMPDIR,
    apiUrl: options.BALENA_TESTS_API_URL,
    download: options.BALENA_TESTS_API_STAGING_URL,
    delta: options.BALENA_TESTS_SUPERVISOR_DELTA,
    interactiveTests: options.BALENA_TESTS_ENABLE_INTERACTIVE_TESTS,
    worker: options.BALENA_TESTS_WORKER,
    replOnFailure: options.BALENA_TESTS_REPL_ON_FAILURE,
    network: {
      type: options.BALENA_TESTS_NETWORK,
      wifiSsid: options.BALENA_TESTS_WIFI_SSID,
      wifiKey: options.BALENA_TESTS_WIFI_KEY
    }
  }
  conf.sshKeyLabel = conf.applicationName

  return conf
}
