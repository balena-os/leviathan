/**
 * # Send reports/artifacts from testbot back to client
 *
 * By default, serial logs (given that the hardware is set up correctly), and the
 * logs from the tests will be sent back to the client that started the test, upon
 * the test finishing. Other artifacts can be sent back to the client using the
 * `archiver` method.
 *
 * The Archiver is imported into each test and hence the methods can be accessed within any test. Check
 * `test.js` to check the imports. To archive a file:
 *
 * @example
 * ```js
 * 	await this.Archiver.add(this.id, "Path/to/file/needs/to/be/archived");
 * ```
 *
 * To directly archive the output of a command, example: `journalctl` or `dmesg` commands. Use the
 * `archiveLogs` helper accessible through `worker` context.
 *
 * * @example
 * ```js
 * 	await this.context.get().worker.archiveLogs(title, target, command);
 * ```
 *
 * Using this method, at the end of the test, any artifacts added to the archive are compressed and
 * downloaded by the client. These are available in the `workspace/reports` directory at the end of
 * the test. This can also be helpful when storing artifacts/reports/logs after a test suite run.
 *
 * @module Archiver
 */

/*
 * Copyright 2019 balena
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

const config = require('config');
const { createWriteStream } = require('fs');
const { copy, ensureDir } = require('fs-extra');
const { basename, join } = require('path');

module.exports = {
	/**
	 * Archive a file to be later sent to the client as an artifact.
	 *
	 * @param {string} id The name of the directory in which logs will be archived. Usuallly this value is the name of the
	 * test suite (Available in the test using `this.id`)
	 * @param {string} artifactPath The absolute path of the file needed to be archived.
	 */
	add: async (id, artifactPath) => {
		const baseLocation = join(config.get('leviathan.artifacts'), id)
		const archivePath = join(baseLocation, basename(artifactPath));
		await ensureDir(baseLocation);
		await copy(artifactPath, archivePath);
	},

	/**
	 * Archive the file as a stream to be later sent to the client as an artifact.
	 *
	 * @param {string} id The name of the directory in which logs will be archived. Usuallly this value is the name of the
	 * test suite (Available in the test using `this.id`)
	 * @param {string} artifactPath The absolute path of the file needed to be archived.
	 * @returns stream of the file
	 */
	getStream: async (id, artifactPath) => {
		const baseLocation = join(config.get('leviathan.artifacts'), id)
		const archivePath = join(baseLocation, basename(artifactPath));
		await ensureDir(baseLocation);
		return createWriteStream(archivePath);
	}
};
