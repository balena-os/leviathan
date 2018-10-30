/*
 * Copyright 2017 balena
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

const _ = require('lodash')
const Bluebird = require('bluebird')
const retry = require('bluebird-retry')
const Store = require('data-store')

const utils = require('./../utils')
const Balena = utils.requireComponent('balena', 'sdk')

const RETRIES = 5
const DELAY = 1500

module.exports = async (DATA_STORE_PATH, DATA_STORE) => {
  const store = new Store(DATA_STORE, {
    base: DATA_STORE_PATH
  })
  const options = store.get('options')

  const balena = new Balena(options.apiUrl)

  await retry(() => {
    console.log(`Removing application: ${options.applicationName}`)
    return balena.removeApplication(options.applicationName).catch({
      code: 'BalenaNotLoggedIn'
    }, _.noop)
  }, {
    max_tries: RETRIES,
    interval: DELAY
  })

  await retry(() => {
    console.log(`Delete SSH key with label: ${options.sshKeyLabel}`)
    return Bluebird.resolve(balena.removeSSHKey(options.sshKeyLabel)).catch({
      code: 'BalenaNotLoggedIn'
    }, _.noop)
  }, {
    max_tries: RETRIES,
    interval: DELAY
  })

  await retry(() => {
    console.log('Log out of balena')
    return balena.logout().catch({
      code: 'BalenaNotLoggedIn'
    }, _.noop)
  }, {
    max_tries: RETRIES,
    interval: DELAY
  })

  console.log('Remove local data store')
  store.unlink()
}
