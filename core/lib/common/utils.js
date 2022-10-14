/**
 * # Utility helpers
 *
 * The module contains helpers to better write tests.
 *
 * @module Leviathan Utility helpers
 */

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

'use strict';

const Bluebird = require('bluebird');
const exec = Bluebird.promisify(require('child_process').exec);
const { fs } = require('mz');
const keygen = require('ssh-keygen-lite');
const path = require('path');
const { NodeSSH } = require('node-ssh');
const assignIn = require('lodash/assignIn');

const getSSHClientDisposer = (config) => {
	const createSSHClient = (conf) => {
		return Bluebird.resolve(
			new NodeSSH().connect(
				assignIn(
					{
						agent: process.env.SSH_AUTH_SOCK,
						keepaliveInterval: 10000 * 60 * 5, // 5 minute interval
					},
					conf,
				),
			),
		);
	};

	return createSSHClient(config).disposer((client) => {
		client.dispose();
	});
};

module.exports = {
	/**
	 * This is the base hostOS execution command used by many other functions like `executeCommandIntoHostOs` to
	 * execute commands on the DUT being passed through SSH.
	 *
	 * @param {string} command The command to be executed over SSH
	 * @param {*} config
	 *
	 * @category helper
	 */
	executeCommandOverSSH: async (command, config) => {
		return Bluebird.using(getSSHClientDisposer(config), (client) => {
			return new Bluebird(async (resolve, reject) => {
				try{
					client.connection.on('error', (err) => {
						console.log(`Connection err: ${err.message}`)
						reject(err);
					});

					resolve(
						await client.exec(command, [], {
							stream: 'both',
						}),
					);
				} catch(e){
					reject(e)
				}
			})
		})
	},

	/**
	 * @param {string} promise The command you need to wait for
	 * @param {boolean} rejectionFail Whether the `waitUntil()` function error out, if a iteration fails once. Defaults to `false`, which results in `waitUntil()` not failing as it iterates and wait for the condition to satisfy.
	 * @param {number} _times Specify how many times should the command be executed
	 * @param {number} _delay Specify the delay between each iteration of the command execution
	 * @throws error on first iteration if`rejectionFail` is true. Otherwise throws error after iterating through the specified `_times` parameter
	 *
	 * @category helper
	 */
	waitUntil: async (
		promise,
		rejectionFail = false,
		_times = 20,
		_delay = 30000,
	) => {
		const _waitUntil = async (timesR) => {
			if (timesR === 0) {
				throw new Error(`Condition ${promise} timed out`);
			}

			try {
				if (await promise()) {
					return;
				}
			} catch (error) {
				if (rejectionFail) {
					throw error;
				}
			}

			await Bluebird.delay(_delay);

			return _waitUntil(timesR - 1);
		};

		await _waitUntil(_times);
	},

	createSSHKey: (keyPath) => {
		return fs
			.access(path.dirname(keyPath))
			.then(async () => {
				const keys = await keygen({
					location: keyPath,
					type: 'ed25519'
				});
				await exec('ssh-add -D');
				await exec(`ssh-add ${keyPath}`);
				return keys;
			})
			.then((keys) => {
				return {
					pubKey: keys.pubKey.trim(),
					key: keys.key.trim(),
				};
			});
	},
	getFilesFromDirectory(basePath, ignore = []) {
		async function _recursive(_basePath, _ignore = []) {
			let files = [];
			const entries = await fs.readdir(_basePath);

			for (const entry of entries) {
				if (_ignore.includes(entry)) {
					continue;
				}

				const stat = await fs.stat(path.join(_basePath, entry));

				if (stat.isFile()) {
					files.push(path.join(_basePath, entry));
				}

				if (stat.isDirectory()) {
					files = files.concat(
						await _recursive(path.join(_basePath, entry), _ignore),
					);
				}
			}

			return files;
		}

		return _recursive(basePath, ignore);
	},
};
