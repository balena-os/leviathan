/*
 * Copyright 2017 resin io
 *
 * Licensed under the Apache License, Version 2 0 (the "License");
 * you may not use this file except in compliance with the License
 * You may obtain a copy of the License at
 *
 *    http://www apache org/licenses/LICENSE-2 0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied
 * See the License for the specific language governing permissions and
 * limitations under the License
 */

'use strict'

const _ = require('lodash')
const Bluebird = require('bluebird')
const Pensieve = require('pensieve-sdk').Pensieve
const readFile = Bluebird.promisify(require('fs').readFile)
const fse = require('fs-extra')
const fs = require('fs')

const config = {
  owner: 'resin-io',
  name: 'resinos-tests',
  reference: 'gh-pages',
  credentials: {
    token: process.env.GITHUB_TOKEN
  }
}

const pensieve = new Pensieve(config, 'results', 'results')

const createNewFragment = async (metricsFile, resultFile) => {
  const schema = _.map(await pensieve.getSchema(), 'name')
  const metrics = fse.readJsonSync(metricsFile)

  const newFragment = {
    author: process.env.RESINOS_TESTS_EMAIL,
    timestamp: new Date().toLocaleDateString().replace(/\//, '-'),
    device_type: process.env.RESINOS_TESTS_DEVICE_TYPE,
    provision_time: metrics.provisionTime,
    imagesize: metrics.imageSize,
    resin_os_version: process.env.RESINOS_TESTS_RESINOS_VERSION,
    body: (await readFile(resultFile)).toString()
  }

  const diff = _.difference(Object.keys(newFragment), schema)
  if (diff.length > 0) {
    throw new Error(`ERROR: Some fragment property names do not exist in the pensieve schema ${diff}`)
  }
  return newFragment
}

exports.publishResultsToPensieve = async (metricsFile, resultFile) => {
  if (!fs.existsSync(metricsFile) || !fs.existsSync(resultFile) || !_.isUndefined(process.env.CI)) {
    pensieve.updateFragment(await createNewFragment(metricsFile, resultFile))
    return `Published test results to ${pensieve.backend.account}.github.io/${pensieve.backend.name}`
  }
  return 'Skipping result publish!'
}

require('make-runnable/custom')({
  printOutputFrame: false
})
