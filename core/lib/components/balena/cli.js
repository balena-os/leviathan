/**
 * # balenaCLI helpers
 *
 * balenaCLI helpers performs frequently executed tasks in order to keep things DRY.
 * For one-off commands, it's recommended to not use the helpers and instead directly use the
 * balenaCLI with the example explained below.
 *
 * @example The core service where the test suites run already has balenaCLI installed. There is no need to
 * initalise the `CLI` class to run/execute any CLI command inside the tests. Instead use
 *
 * ```js
 * const { exec } = require("child_process");
 * await exec(`balena push joystart --source .`)
 * ```
 *
 * To get output from the commands being exectued, use the callback
 *
 * ```js
 * const { exec } = require("child_process");
 * await exec(`balena logs alliance-fleet --service "normandy-sr0"`, (error, stdout, stderr) => {
 *   if (error) {
 *     throw new error
 *   }
 *   console.log(stdout)
 * })
 * ```
 *
 * @module balenaCLI helpers
 */

/* Copyright 2019 balena
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

'use strict';

const { pathExists, ensureFile } = require('fs-extra');
const { exec, spawn } = require('mz/child_process');
const { join } = require('path');

module.exports = class CLI {
	constructor(
		apiUrl = 'balena-cloud.com',
		logger = { log: console.log, status: console.log, info: console.log },
	) {
		this.logger = logger;
	}

	/**
	 * Preload the image onto the target image
	 *
	 * @param {string} image path to the image
	 * @param {*} options options to be executed with balena preload command
	 *
	 * @category helper
	 */
	async preload(image, options) {
		// Trigger preload on the worker for the image it already has
	}

	/**
	 * Pushes application to local device locally
	 *
	 * @param {string} target The address/uuid of the device
	 * @param {*} options Options to be executed with balena preload command
	 *
	 * @category helper
	 */
	push(target, options) {
		
		//  Reconsider this, I forgot why we used to local push from core on unmanaged OS tests. 

		this.logger.log('Performing local push');
		return exec(
			`balena push ${target} --source ${options.source} --nolive --detached`,
		);
	}
};
