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

const _ = require('lodash')

const utils = require('./../lib/utils')
const resinio = utils.requireComponent('resinio', 'sdk')

const teardown = async () => {
  console.log(`Removing application: ${process.env.RESINOS_TESTS_APPLICATION_NAME}`)
  await resinio.removeApplication(process.env.RESINOS_TESTS_APPLICATION_NAME).catch({
    code: 'ResinNotLoggedIn'
  }, _.noop)

  console.log('Log out of resin.io')
  await resinio.logout().catch({
    code: 'ResinNotLoggedIn'
  }, _.noop)
}

teardown()
