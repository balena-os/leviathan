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

const randomstring = require('randomstring')
const semver = require('semver')

const utils = require('./../lib/utils')
const Resinio = utils.requireComponent('resinio', 'sdk')

const resinio = new Resinio(process.env.RESINOS_TESTS_RESINIO_API)

const testID = randomstring.generate({
  length: 5,
  charset: 'alphabetic'
})

exports.APPLICATION_NAME = (appName) => {
  return `${appName}_${testID}`
}

exports.RESINOS_VERSION = async (version, deviceType) => {
  const supportedOSVersion = await resinio.getAllSupportedOSVersions(deviceType)
  return `${await semver.maxSatisfying(supportedOSVersion, version)}`
}

require('make-runnable/custom')({
  printOutputFrame: false
})
