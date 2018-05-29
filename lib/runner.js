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

// Where all the interprocess data will exist
const DATA_STORE_PATH = `${process.cwd()}/.data`
const DATA_STORE = process.pid.toString()

const {
  clearHandlers
} = require('./utils')

const {
  spawn
} = require('child_process')

const Bluebird = require('bluebird')
const ipc = require('./ipc')

// This setting is set by Ava, however Bluebird will complain
// if its set while inside a promise, so we do it ourselves before.
// See: http://bluebirdjs.com/docs/api/promise.longstacktraces.html
Bluebird.config({
  longStackTraces: true
})

clearHandlers([
  'SIGINT',
  'SIGHUP',
  'SIGQUIT',
  'SIGTERM',
  'uncaughtException'
])

require('./scripts/options.js')(process.env, DATA_STORE_PATH, DATA_STORE)
  .then(ipc.createServer)
  .then((IPC_SERVER_ID) => {
    return spawn(process.execPath, [ require.resolve('ava/cli') ], {
      env: {
        DATA_STORE_PATH,
        DATA_STORE,
        [IPC_SERVER_ID]: process.env[IPC_SERVER_ID],
        CI: process.env.CI
      }
    })
  })
  .then((ava) => {
    ava.stdout.pipe(process.stdout)
    ava.stderr.pipe(process.stderr)
    process.stdin.pipe(ava.stdin)

    let stdout = '';

    [ 'exit', 'error' ].forEach((event) => {
      ava.on(event, async (code) => {
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

    ava.stdout.on('data', (data) => {
      stdout += data
    })
  })
