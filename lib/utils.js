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
const fs = Bluebird.promisifyAll(require('fs'))
const fse = require('fs-extra')
const inquirer = require('inquirer')
const git = require('simple-git/promise')
const semver = require('resin-semver')
const repl = require('repl')
const SSH = require('node-ssh')
const path = require('path')
const utils = require('../lib/utils')

exports.requireComponent = (name, instance) => {
  const COMPONENTS_DIRECTORY = './components'

  try {
    return require(`${COMPONENTS_DIRECTORY}/${name}/${instance}`)
  } catch (error) {
    console.log(error)
    if (error.code === 'MODULE_NOT_FOUND') {
      return require(`${COMPONENTS_DIRECTORY}/${name}/default`)
    }
    throw error
  }
}

const getTunnelDisposer = (config) => {
  const getTunnel = ({
    socket, host, port, proxyAuth
  }) => {
    return new Bluebird((resolve, reject) => {
      let tunnelProxyResponse = ''

      socket.on('error', (error) => {
        let errorLine = `Could not connect to ${host}:${port} tunnel`
        if (_.has(error, [ 'message' ])) {
          errorLine += `: ${error.message}`
        }

        reject(new Error(errorLine))
      })

      socket.on('end', () => {
        const errorLine = new Error(`Could not connect to ${host}:${port} tunneling socket closed prematurely`)
        reject(errorLine)
      })

      socket.on('data', (chunk) => {
        if (chunk !== null) {
          tunnelProxyResponse += chunk.toString()
        }

        if (!_.includes(tunnelProxyResponse, '\r\n\r\n')) {
          return
        }

        let httpStatusLine = tunnelProxyResponse.split('\r\n')[0]
        const httpStatusCode = parseInt(httpStatusLine.split(' ')[1], 10)

        if (httpStatusCode === 407) {
          httpStatusLine = 'HTTP/1.0 403 Forbidden'
        }

        if (httpStatusCode !== 200) {
          const errorLine = new Error(`Could not establish socket connection to ${host}:${port} - ${httpStatusLine}`)
          reject(errorLine)
        }

        resolve(socket)
      })

      // Write the request
      socket.write(`CONNECT ${host}:${port} HTTP/1.0\r\n`)

      if (proxyAuth) {
        socket.write(`Proxy-Authorization: Basic ${Buffer.from(proxyAuth).toString('base64')}\r\n`)
      }

      socket.write('\r\n\r\n')
    })
  }

  return getTunnel(config).disposer((socket) => {
    socket.destroy()
  })
}

const getSSHClientDisposer = (config) => {
  const createSSHClient = (conf) => {
    return Bluebird.resolve((new SSH()).connect(conf))
  }

  return createSSHClient(config).disposer((client) => {
    client.dispose()
  })
}

exports.executeCommandOverSSH = async (command, config, tunnelConfig) => {
  return Bluebird.using(getTunnelDisposer(tunnelConfig), (tunnel) => {
    return Bluebird.using(getSSHClientDisposer(config), (client) => {
      return client.exec(command, [], {
        stream: 'both'
      })
    })
  })
}

exports.getWorker = (worker) => {
  const WORKER_DIRECTORY = './workers'

  try {
    return require(`${WORKER_DIRECTORY}/${worker}`)
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return require(`${WORKER_DIRECTORY}/manual`)
    }
    throw error
  }
}

exports.waitUntil = async (promise, _times = 0, _delay = 30000) => {
  if (_times > 60) {
    throw new Error(`Condition ${promise} timed out`)
  }

  if (await promise()) {
    return Bluebird.resolve()
  }

  await Bluebird.delay(_delay)

  return exports.waitUntil(promise, _times + 1)
}

const waitProgressCompletion = async (promise, terminate, _times = 0, _delay = 30000) => {
  if (_times > 20) {
    throw new Error(`Progress for ${promise} has timed out`)
  }

  if (await terminate()) {
    return Bluebird.resolve()
  }

  const initial = await promise()

  await Bluebird.delay(_delay)

  const step = await promise()

  await Bluebird.delay(_delay)

  if (_.chain(_.zip(initial, step))
    .filter((pair) => {
      return !_.isEqual(pair, [ null, null ])
    })
    .every(([ i, s ]) => {
      return s - i === 0
    })) {
    return waitProgressCompletion(promise, terminate, _times + 1)
  }

  return waitProgressCompletion(promise, terminate)
}

const printInstructionsSet = (title, instructions) => {
  if (_.isEmpty(instructions)) {
    return
  }

  console.log(`==== ${title}`)

  _.each(instructions, (instruction) => {
    console.log(`- ${instruction}`)
  })
}

exports.runManualTestCase = async (testCase) => {
  // Some padding space to make it easier to the eye
  await Bluebird.delay(50)
  printInstructionsSet('PREPARE', testCase.prepare)
  printInstructionsSet('DO', testCase.do)
  printInstructionsSet('ASSERT', testCase.assert)
  printInstructionsSet('CLEANUP', testCase.cleanup)

  return (await inquirer.prompt([
    {
      type: 'confirm',
      name: 'result',
      message: 'Did the test pass?',
      default: false
    }
  ])).result
}

exports.getDeviceUptime = async (connection) => {
  const start = process.hrtime()[0]
  const uptime = await connection('cut -d \' \' -f 1 /proc/uptime')

  return Number(uptime) - (start - process.hrtime()[0])
}

exports.clearHandlers = (events) => {
  events.forEach((event) => {
    process.on(event, _.noop)
  })
}

const cloneRepo = async (options) => {
  await fse.remove(options.path)
  await git().clone(options.url, options.path)
}

const pushRepo = async (key, options) => {
  const GIT_SSH_COMMAND = `ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no -i ${key}`

  await git(options.repo.path).addRemote(options.repo.remote.name, options.repo.remote.url)
  await git(options.repo.path).env('GIT_SSH_COMMAND', GIT_SSH_COMMAND).push(options.repo.remote.name, options.repo.branch.name, {
    '--force': null
  })

  return (await git(options.repo.path).revparse([ options.repo.branch.name ])).trim()
}

exports.resolveVersion = async (supported, versionRaw = 'latest') => {
  const KEYWORDS = [ 'recommended', 'latest', 'default' ]
  const version = _.trimStart(versionRaw, 'v')

  if (semver.valid(version)) {
    const index = _.indexOf(supported.versions, version)

    if (index !== -1) {
      return supported.versions[index]
    }
  }

  if (_.includes(KEYWORDS, version)) {
    return supported[version]
  }

  throw new Error('Keyword not recognized or invalid version provided')
}

exports.pushAndWaitRepoToBalenaDevice = async (options) => {
  await cloneRepo({
    path: options.path,
    url: options.url
  })

  const hash = await pushRepo(options.key, {
    repo: {
      remote: {
        name: 'balena',
        url: await options.balena.sdk.getApplicationGitRemote(options.applicationName)
      },
      branch: {
        name: 'master'
      },
      path: options.path
    }
  })

  await waitProgressCompletion(async () => {
    return options.balena.sdk.getAllServicesProperties(options.uuid, 'download_progress')
  }, async () => {
    const services = await options.balena.sdk.getAllServicesProperties(options.uuid, [ 'status', 'commit' ])

    if (_.isEmpty(services)) {
      return false
    }

    return _.every(services, {
      status: 'Running',
      commit: hash
    })
  })

  return hash
}

exports.moveDeviceToApplication = async (options) => {
  await options.balena.sdk.moveDeviceToApplication(options.uuid, options.applicationName)

  await waitProgressCompletion(async () => {
    return options.balena.sdk.getAllServicesProperties(options.uuid, 'download_progress')
  }, async () => {
    const services = await options.balena.sdk.getAllServicesProperties(options.uuid, [ 'status', 'commit' ])

    if (_.isEmpty(services)) {
      return false
    }

    return _.every(services, {
      status: 'Running'
    })
  })
}

exports.pushRepoToApplication = async (options) => {
  await cloneRepo({
    path: options.path,
    url: options.url
  })

  return pushRepo(options.key, {
    repo: {
      remote: {
        name: 'balena',
        url: await options.balena.sdk.getApplicationGitRemote(options.applicationName)
      },
      branch: {
        name: 'master'
      },
      path: options.path
    }
  })
}

exports.pushRepoToApplicationPreload = async (options) => {
  await cloneRepo({
    path: options.path,
    url: options.url
  })

  const hash = await pushRepo(options.key, {
    repo: {
      remote: {
        name: 'balena',
        url: await options.balena.sdk.getApplicationGitRemote(options.applicationName)
      },
      branch: {
        name: 'master'
      },
      path: options.path
    }
  })

  await git(options.path).addConfig('user.name', 'Test Bot')
  await git(options.path).addConfig('user.email', 'testbot@resin.io')
  await git(options.path).commit('empty', {
    '--allow-empty': null
  })
  await git(options.path).removeRemote('balena')

  await pushRepo(options.key, {
    repo: {
      remote: {
        name: 'balena',
        url: await options.balena.sdk.getApplicationGitRemote(options.applicationName)
      },
      branch: {
        name: 'master'
      },
      path: options.path
    }
  })
  return hash
}

exports.pushKernelModuleRepoToBalenaDevice = async (options) => {
  await cloneRepo({
    path: options.path,
    url: options.url
  })

  await utils.searchAndReplace(
    path.join(options.path, 'build.sh'),
    '\'https://files.balena-cloud.com\'',
    '\'https://files.balena-staging.com\''
  )

  await utils.searchAndReplace(
    path.join(options.path, 'Dockerfile.template'),
    '\'2.29.0+rev1.prod\'',
    `'${options.balenaOSVersion}'`
  )

  await git(options.path).addConfig('user.name', 'Test Bot')
  await git(options.path).addConfig('user.email', 'testbot@resin.io')
  await git(options.path).add('./*')
  await git(options.path).commit('Changes for kernel module build')

  const hash = await pushRepo(options.key, {
    repo: {
      remote: {
        name: 'balena',
        url: await options.balena.sdk.getApplicationGitRemote(options.applicationName)
      },
      branch: {
        name: 'master'
      },
      path: options.path
    }
  })

  await waitProgressCompletion(async () => {
    return options.balena.sdk.getAllServicesProperties(options.uuid, 'download_progress')
  }, async () => {
    const services = await options.balena.sdk.getAllServicesProperties(options.uuid, [ 'status', 'commit' ])

    if (_.isEmpty(services)) {
      return false
    }

    return _.every(services, {
      status: 'Running',
      commit: hash
    })
  })

  return hash
}

exports.repl = (context, options) => {
  return new Bluebird((resolve, reject) => {
    const prompt = repl.start({
      prompt: `${options.name} > `,
      useGlobal: true,
      terminal: true
    })

    _.assign(prompt.context, context)

    prompt.on('exit', () => {
      resolve()
    })
  })
}

exports.searchAndReplace = async (filePath, regex, replace) => {
  const content = await fs.readFileAsync(filePath, 'utf-8')
  return fs.writeFileAsync(filePath, content.replace(regex, replace), 'utf-8')
}

exports.getDeviceLogs = async (options) => {
  const deviceLogs = await options.balena.sdk.getDeviceLogsHistory(options.uuid)
  const deviceLogsMessage = []

  deviceLogs.forEach((element) => {
    deviceLogsMessage.push(element.message)
  })
  return deviceLogsMessage
}
