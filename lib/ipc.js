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

const Bluebird = require('bluebird')
const _ = require('lodash')

const inquirer = require('inquirer')
const ipc = require('node-ipc')

const packageJSON = require('../package.json')
const IPC_SERVER_ID_ENV_VAR = 'IPC_SERVER_ID'
const IPC_PREFIX = packageJSON.name

exports.requestConfirmation = () => {
  const serverId = process.env[IPC_SERVER_ID_ENV_VAR]
  ipc.config.id = `${IPC_PREFIX}-client-${process.pid}`
  ipc.config.silent = true

  return new Bluebird((resolve, reject) => {
    ipc.connectTo(serverId, () => {
      ipc.of[serverId].on('response', (answer) => {
        ipc.disconnect(serverId)
        resolve(answer)
      })

      ipc.of[serverId].on('connect', () => {
        ipc.of[serverId].emit('confirm-request')
      })

      ipc.of[serverId].on('error', reject)
    })
  })
}

exports.createServer = () => {
  const IPC_SERVER_ID = `${IPC_PREFIX}-server-${process.pid}`

  ipc.config.id = IPC_SERVER_ID
  ipc.config.silent = true
  ipc.serve()

  const terminateServer = () => {
    _.each(ipc.server.sockets, (socket) => {
      socket.destroy()
    })

    ipc.server.stop()
  }

  ipc.server.on('confirm-request', (_data, socket) => {
    return inquirer.prompt([
      {
        type: 'confirm',
        name: 'result',
        message: 'Did the test pass?',
        default: false
      }
    ]).then((answer) => {
      ipc.server.emit(socket, 'response', answer.result)
    })
  })

  return new Bluebird((resolve, reject) => {
    ipc.server.on('error', (error) => {
      terminateServer()
      reject(error)
    })

    ipc.server.on('start', () => {
      process.env[IPC_SERVER_ID_ENV_VAR] = IPC_SERVER_ID
      resolve()
    })

    ipc.server.start()
  })
}

