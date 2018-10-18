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
const Bluebird = require('bluebird')
const fse = require('fs-extra')
const inquirer = require('inquirer')
const git = require('simple-git/promise')
const retry = require('bluebird-retry')
const semver = require('resin-semver')

const RETRIES = 5
const DELAY = 1500

const {
  spawn
} = require('child_process')

exports.requireComponent = (name, instance) => {
  const COMPONENTS_DIRECTORY = './components'

  try {
    return require(`${COMPONENTS_DIRECTORY}/${name}/${instance}`)
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return require(`${COMPONENTS_DIRECTORY}/${name}/default`)
    }
    throw error
  }
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

exports.ssh = async (command, privateKeyPath, options) => {
  const opts = [
    '-t',
    '-o LogLevel=ERROR',
    '-o StrictHostKeyChecking=no',
    '-o UserKnownHostsFile=/dev/null'
  ].concat(`-i${privateKeyPath}`).concat(options)

  return retry(() => {
    return new Bluebird((resolve, reject) => {
      const ssh = spawn('ssh', opts)

      let stdout = ''
      let stderr = ''

      ssh.stdin.write(`${command};exit\n`)
      ssh.stdin.end()

      ssh.stdout.on('data', (data) => {
        stdout += data
      })
      ssh.stderr.on('data', (data) => {
        console.log(stderr)
        stderr += data
      })
      ssh.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`SSH error: ${stderr}`))
        }
        resolve(stdout.trim())
      })
    }, {
      max_tries: RETRIES,
      interval: DELAY,
      throw_original: true
    })
  })
}

exports.waitUntil = async (promise, _times = 0, _delay = 30000) => {
  if (_times > 20) {
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

exports.getDeviceUptime = async (ssh) => {
  const start = process.hrtime()[0]
  const uptime = await ssh('cut -d " " -f 1 /proc/uptime')

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
  const version = _.trim(versionRaw, 'v')

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

exports.pushAndWaitRepoToResinDevice = async (options) => {
  await cloneRepo({
    path: options.path,
    url: options.url
  })

  const hash = await pushRepo(options.key, {
    repo: {
      remote: {
        name: 'resin',
        url: await options.resinio.getApplicationGitRemote(options.applicationName)
      },
      branch: {
        name: 'master'
      },
      path: options.path
    }
  })

  await waitProgressCompletion(async () => {
    return options.resinio.getAllServicesProperties(options.uuid, 'download_progress')
  }, async () => {
    const services = await options.resinio.getAllServicesProperties(options.uuid, [ 'status', 'commit' ])

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
