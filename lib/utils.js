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
const byline = require('byline')
const inquirer = require('inquirer')

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

exports.ssh = async (command, privateKeyPath, options) => {
  const opts = [
    '-t',
    '-o LogLevel=ERROR',
    '-o StrictHostKeyChecking=no',
    '-o UserKnownHostsFile=/dev/null'
  ].concat(`-i${privateKeyPath}`).concat(options)

  return new Bluebird((resolve, reject) => {
    const ssh = spawn('ssh', opts)
    const lineStream = byline.createStream()

    const output = []

    // The resin proxy will output a welcome message, we ignore it by marking the beginning and the end of the ssh command output.
    const START = '<START>'
    const END = '<END>'

    ssh.stdout.pipe(lineStream)
    ssh.stdin.write(`echo "${START}";${command};echo "${END}";exit\n`)
    ssh.stdin.end()

    lineStream.on('data', (data) => {
      output.push(data.toString('utf8'))
    })
    ssh.stderr.on('data', (data) => {
      reject(data.toString('utf8'))
    })
    ssh.on('exit', () => {
      resolve(output.slice(
        output.indexOf(START) + 1,
        output.indexOf(END)
      ))
    })
  })
}

exports.waitUntil = async (promise, _times = 0, _delay = 30000) => {
  if (await promise()) {
    return Bluebird.resolve()
  }

  if (_times > 20) {
    throw new Error(`Condition ${promise} timed out`)
  }

  return Bluebird.delay(_delay).then(() => {
    return exports.waitUntil(promise, _times + 1, _delay)
  })
}

exports.waitProgressCompletion = async (promise, _epsilon = 10, _times = 0, _delay = 30000) => {
  const progress = await Bluebird.delay(_delay).then(promise)

  if (progress === null) {
    throw new Error(`${promise} might have finished in the wait period.`)
  }

  if (_times > 20) {
    throw new Error(`Progress for ${promise} has timed out`)
  }

  if (progress <= 100 && progress > (100 - _epsilon)) {
    return Bluebird.resolve()
  }

  return Bluebird
    .delay(_delay)
    .then(promise)
    .then((step) => {
      if (progress - step === 0) {
        return exports.waitProgressCompletion(promise, _times + 1)
      }

      return exports.waitProgressCompletion(promise)
    })
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
