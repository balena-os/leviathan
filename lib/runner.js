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

const Bluebird = require('bluebird')

const _ = require('lodash')
const {
  clearHandlers
} = require('./utils')
const {
  fork
} = require('child_process')

clearHandlers([
  'SIGINT',
  'SIGHUP',
  'SIGQUIT',
  'SIGTERM'
])

const run = async (DATA_STORE_PATH, DATA_STORE) => {
  await require('./scripts/options.js')(process.env, DATA_STORE_PATH, DATA_STORE)

  const main = fork('./lib/main', {
    env: {
      DATA_STORE_PATH,
      DATA_STORE,
      CI: process.env.CI
    },
    stdio: [ 'inherit', 'pipe', 'pipe', 'ipc' ]
  })

  let stdout = ''

  main.stdout.pipe(process.stdout)
  main.stderr.pipe(process.stderr)

  main.stdout.on('data', (data) => {
    stdout += data
  })

  _.forEach([ 'exit', 'error' ], (event) => {
    main.on(event, async (code) => {
      process.exitCode = code || process.exitCode

      Bluebird.try(() => {
        if (code !== null) {
          require('./scripts/post.js')(stdout, DATA_STORE_PATH, DATA_STORE)
        }
      }).finally(() => {
        process.stdin.end()
        require('./scripts/teardown.js')(DATA_STORE_PATH, DATA_STORE)
      })
    })
  })
}

run(`${process.cwd()}/.data`, process.pid.toString())
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
