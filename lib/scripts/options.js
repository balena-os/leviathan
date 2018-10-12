/*
 * Copyright 2018 resin.io
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

const Store = require('data-store')
const randomstring = require('randomstring')

const utils = require('./../utils')
const Resinio = utils.requireComponent('resinio', 'sdk')

const testID = randomstring.generate({
  length: 5,
  charset: 'alphabetic'
})

module.exports = async (options, DATA_STORE_PATH, DATA_STORE) => {
  const store = new Store(DATA_STORE, {
    base: DATA_STORE_PATH
  })
  const resinio = new Resinio(options.RESINOS_TESTS_RESINIO_STAGING_URL)
  const supported = await resinio.getAllSupportedOSVersions(options.RESINOS_TESTS_DEVICE_TYPE)

  const conf = {
    deviceType: options.RESINOS_TESTS_DEVICE_TYPE,
    resinOSVersion: `${await utils.resolveVersion(supported, options.RESINOS_TESTS_RESINOS_VERSION)}`,
    resinOSVersionUpdate: `${await utils.resolveVersion(supported, options.RESINOS_TESTS_RESINOS_VERSION_UPDATE)}`,
    applicationName: `${options.RESINOS_TESTS_APPLICATION_NAME}_${testID}`,
    device: options.RESINOS_TESTS_DEVICE,
    apiKey: options.RESINOS_TESTS_API_KEY,
    email: options.RESINOS_TESTS_EMAIL,
    password: options.RESINOS_TESTS_PASSWORD,
    tmpdir: options.RESINOS_TESTS_TMPDIR,
    resinUrl: options.RESINOS_TESTS_RESINIO_URL,
    resinStagingUrl: options.RESINOS_TESTS_RESINIO_STAGING_URL,
    delta: options.RESINOS_TESTS_RESIN_SUPERVISOR_DELTA,
    interactiveTests: options.RESINOS_TESTS_ENABLE_INTERACTIVE_TESTS,
    configuration: {
      network: options.RESINOS_TESTS_NETWORK,
      wifiSsid: options.RESINOS_TESTS_WIFI_SSID,
      wifiKey: options.RESINOS_TESTS_WIFI_KEY
    }
  }
  conf.sshKeyLabel = conf.applicationName

  store.set({
    options: conf
  })
}
