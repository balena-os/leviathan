/*
 * Copyright 2018 resin io
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
const Pensieve = require('pensieve-sdk').Pensieve
const readJson = require('bluebird').promisify(require('fs-extra').readJson)
const stat = require('bluebird').promisify(require('fs').stat)

const config = {
  owner: 'resin-io',
  name: 'resinos-tests',
  reference: 'gh-pages',
  credentials: {
    token: process.env.GITHUB_TOKEN
  }
}

const pensieve = new Pensieve(config, 'results', 'results')

const createNewFragment = async (resultFile) => {
  const schema = _.map(await pensieve.getSchema(), 'name')
  const results = await readJson(resultFile)

  const newFragment = {
    device_type: results.resinDeviceType,
    provision_time: results.provisionTime,
    image_size: results.imageSize,
    resin_os_version: results.resinOSVersion,
    body: results.body,
    author: results.author,
    timestamp: new Date().toLocaleDateString().replace(/\//, '-')
  }

  const diff = _.difference(Object.keys(newFragment), schema)

  if (diff.length > 0) {
    throw new Error(`ERROR: Some fragment property names do not exist in the pensieve schema ${diff}`)
  }

  return newFragment
}

exports.publish = async (resultFile) => {
  if (await stat(resultFile) && _.isUndefined(process.env.CI)) {
    pensieve.updateFragment(await createNewFragment(resultFile))
    return `Published test results to ${pensieve.backend.account}.github.io/${pensieve.backend.name}`
  }

  return 'Skipping result publish!'
}

require('make-runnable/custom')({
  printOutputFrame: false
})
