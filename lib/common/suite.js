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

const _ = require('lodash')
const Bluebird = require('bluebird')
const fse = require('fs-extra')
const npm = require('npm')
const path = require('path')

module.exports = class Suite {
  constructor (root, options) {
    this.root = path.join(__dirname, '..', root)
    this.options = _.extend({
      deviceType: options.BALENA_TESTS_DEVICE_TYPE,
      tmpdir: options.BALENA_TESTS_TMPDIR,
      interactiveTests: options.BALENA_TESTS_ENABLE_INTERACTIVE_TESTS,
      replOnFailure: options.BALENA_TESTS_REPL_ON_FAILURE
    }, require(path.join(this.root,
      `${path.basename(this.root)}.conf`)
    )(options))
  }

  async disposer (tap) {
    const {
      setup,
      tests
    } = require(path.join(this.root, `${path.basename(this.root)}.suite`))

    await this.installDependencies()

    this.tests = tests.map((test) => {
      return require(path.join(this.root, `${path.basename(this.root)}.tests`, test))
    })

    return Bluebird.method(setup)(path.join(__dirname, '..'), this.options).disposer(async (context) => {
      tap.end()
      await tap.collect()
      await this.removeDependencies()
      await context.teardown.run(setImmediate)
    })
  }

  async installDependencies () {
    console.log(`Install npm dependencies for suite: ${this.root}`)
    await Bluebird.promisify(npm.load)({
      loglevel: 'silent',
      progress: false,
      prefix: this.root,
      'package-lock': false
    })
    await Bluebird.promisify(npm.install)(this.root)
  }

  async removeDependencies () {
    console.log(`Removing npm dependencies for suite: ${this.root}`)
    await Bluebird.promisify(fse.remove)(path.join(this.root, 'node_modules'))
  }
}
