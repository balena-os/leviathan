/**
 * # Worker helpers
 *
 * The worker class can be used to control the testbot hardware. In the `suite.js` file, you can
 * create an instance of it, and then use its methods to flash the DUT, power it on/off, and set up a
 * network AP for the DUT to connect to.
 *
 * @example
 * ```js
 *  const Worker = this.require('common/worker');
 *  this.suite.context.set({
 *      worker: new Worker(DEVICE_TYPE_SLUG, this.getLogger()), // Add an instance of worker to the context
 *  });
 *  const Worker = this.require('common/worker');
 *  const worker = new Worker(DEVICE_TYPE_SLUG, this.getLogger())
 * ```
 * @module Leviathan Worker helpers
 */

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

'use strict';

const Bluebird = require('bluebird');
const retry = require('bluebird-retry');
const utils = require('../common/utils');
const archiver = require('../common/archiver');
const isNumber = require('lodash/isNumber');
const { fs } = require('mz');
const path = require('path');
const once = require('lodash/once');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const request = require('request');
const rp = require('request-promise').defaults({
    timeout: 30 * 1000
});
const exec = Bluebird.promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
const { createGzip, createGunzip } = require('zlib');
const tar = require('tar-fs');
const { EventEmitter } = require('events');

function id() {
	return `${Math.random().toString(36).substring(2, 10)}`;
}

var resolverCache = {};

module.exports = class Worker extends EventEmitter {
	constructor(
	) {
		super();
		this.dutSshKey = `/tmp/id`;
		this.uuid = '';
	}

	/**
	 * Flash the provided OS image onto the connected DUT
	 *
	 * @param {string} imagePath path of the image to be flashed onto the DUT
	 *
	 * @category helper
	 */
	async flash(imagePath) {
	}

	/**
	 * Turn the DUT on
	 *
	 * @category helper
	 */
	async on() {}

	async fetchSerial() {}

	/**
	 * Turn the DUT off
	 *
	 * @category helper
	 */
	async off() {}

	async network(network) {}

	proxy(proxy) {}

	async getContract() {
		return {
			workerType: 'qemu',
		}
	}

	async ip(target) {
		if (target in resolverCache) {
			return Promise.resolve(resolverCache[target]);
		}

		const mdns = require('multicast-dns')();
		return new Promise((resolve, reject) => {
			mdns.on('response', response => {
				response.answers.forEach((a) => {
					if (a.name === target && a.type === 'A') {
						setTimeout(() => {
							delete resolverCache[target];
						}, 1000 * a.ttl);
						resolve(resolverCache[target] = a.data);
					}
				});
			});
			mdns.query({ questions: [
				{ name: target, type: 'A' },
			]}, () => {
				setTimeout(() => {
					reject(new Error(`Failed to resolve ${target}`));
				}, 60 * 5 * 1000);
			});
		}).finally(mdns.destroy);
	}

	async capture(action) {}

	/**
	 * Executes command-line operations in the host OS of the DUT. Assuming the DUT is
	 * connected to the access point broadcasted by the testbot:
	 *
	 * @example
	 * ```js
	 * const Worker = this.require('common/worker');
	 * const worker = new Worker(DEVICE_TYPE_SLUG, this.getLogger())
	 * await worker.executeCommandInHostOS('cat /etc/hostname', `${UUID}.local`);
	 * await worker.executeCommandInHostOS(
	 *   ['jq', `'.hostname=${newHostname}'`, '/mnt/boot/config.json'], `${UUID}.local`
	 * );
	 * ```
	 *
	 * @param {string | Array} command command to be executed on the DUT, arrays are joined by spaces
	 * @param {string} target local UUID of the DUT, example:`${UUID}.local`
	 * @param {{"interval": number, "tries": number}} timeout object containing details of how many times the
	 * command needs to be retried and the intervals between each command execution
	 * @returns {string} Output of the command that was exected on hostOS of the DUT
	 *
	 * @category helper
	 */
	async executeCommandInHostOS(command, target, retryOptions={}) {
		command = command instanceof Array ? command.join(' ') : command;
		let config = {};
		// depending on if the target argument is a .local uuid or not, SSH via the proxy or directly
		if (/.*\.local/.test(target)) {
			let ip = await this.ip(target);
			config = {
				host: ip,
				port: '22222',
				username: 'root',
			};
		} else {
			config = {
				host: 'ssh.balena-devices.com',
				port: '22',
				username: this.username,
			};
			command = `host ${target} ${command}`;
		}

		return retry(
			async () => {
				let result = {}
				try {
					result = await utils.executeCommandOverSSH(command, config);
				} catch (err) {
					console.error(err.message);
					throw new Error(err);
				}

				if (typeof result.code === 'number' && result.code !== 0) {
					throw new Error(
						`"${command}" failed. stderr: ${result.stderr}, stdout: ${result.stdout}, code: ${result.code}`,
					);
				}

				return result.stdout;
			},
			{
				max_tries: 5 * 60,
				interval: 1000,
				throw_original: true,
				...retryOptions,
			},
		);
	}

	async executeCommandInWorkerHost(command, retryOptions={}) {
		let config = {
			host: this.workerHost,
			port: this.workerPort,
			username: this.workerUser,
		}

		return retry(
			async () => {
				let result = {}
				try {
					result = await utils.executeCommandOverSSH(`${this.sshPrefix}${command}`, config);
				} catch (err) {
					console.error(err.message);
					throw new Error(err);
				}

				if (typeof result.code === 'number' && result.code !== 0) {
					throw new Error(
						`"${command}" failed. stderr: ${result.stderr}, stdout: ${result.stdout}, code: ${result.code}`,
					);
				}


				return result.stdout;

			},
			{
				max_tries: 30,
				interval: 5000,
				throw_original: true,
				...retryOptions,
			},
		);
	}

	// executes command in the worker container
	async executeCommandInWorker(command, retryOptions={}) {
		return retry(
			async () => {
				let containerId = await this.executeCommandInWorkerHost(
					`balena ps | grep worker | awk '{print $1}'`,
				);
				let result = await this.executeCommandInWorkerHost(
					`balena exec ${containerId} ${command}`,
				);
				return result;
			},
			{
				max_tries: 10,
				interval: 1000,
				throw_original: true,
				...retryOptions,
			},
		);
	}

	// creates a tunnel a specified DUT port
	async createTunneltoDUT(target, dutPort, workerPort) {
	}

	// sends file over rsync
	async sendFile(filePath, destination, target) {
		if (target === 'worker') {
			let containerId = await this.executeCommandInWorkerHost(
				`balena ps | grep worker | awk '{print $1}'`,
			);
			// todo : replace with npm package
			await exec(
				`rsync -av -e "ssh ${this.workerUser}@${this.workerHost} -p ${this.workerPort} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -q ${this.sshPrefix}balena exec -i" ${filePath} ${containerId}:${destination}`,
			);
		} else {
			let ip = await this.ip(target);
			await exec(
				`rsync -av -e "ssh -p 22222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -q -i ${this.sshKey}" ${filePath} root@${ip}:${destination}`,
			);
		}
	}

	// add ssh key to the worker, so it can ssh into prod DUT's
	async addSSHKey(keyPath) {
	}

	/**
	 * Pushes a release to an application from a given directory for unmanaged devices
	 *
	 * @param {string} target  the <UUID> for the target device
	 * @param {string} source The path to the directory containing the docker-compose/Dockerfile for the containers
	 * @param {string} containerName The name of the container to verify is push has succeeded.
	 * @returns {string} returns state of the device
	 *
	 * @category helper
	 */
	async pushContainerToDUT(target, source, containerName) {
		let ip = await this.ip(target);
		await utils.waitUntil(async () => {
			console.log('Waiting for supervisor to be reachable before local push...')
			return (
				(await rp({
					method: 'GET',
					uri: `http://${ip}:48484/ping`,
					timeout: 5000 * 5
				})) === 'OK'
			);
		}, false);
		console.log('Pushing container to DUT...')
		await new Promise(async (resolve, reject) => {

			const pushTimeout = setTimeout(() => {
				clearTimeout(pushTimeout);
				pushProc.kill();
				reject(Error('Push timed out'));
			}, 1000 * 60 * 10);

			let pushProc = spawn('balena', [
				'push',
				ip,
				'--source',
				source,
				'--nolive',
				'--detached',
				'--debug'
			], { stdio: 'inherit' });

			pushProc.on('exit', (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject()
				}
			});
			pushProc.on('error', (err) => {
				process.off('SIGINT', handleSignal);
				process.off('SIGTERM', handleSignal);
				reject(err);
			});

			clearTimeout(pushTimeout);
		});
		// now wait for new container to be available
		let state = {};
		await utils.waitUntil(async () => {
			console.log(`waiting for container to be available...`)
			state = await rp({
				method: 'GET',
				uri: `http://${ip}:48484/v2/containerId`,
				json: true,
			});

			return state.services[containerName] != null;
		}, false);
		return state;
	}

	/**
	 * Executes the command in the targeted container of a device
	 * @param {string | Array} command The command to be executed, arrays are joined by spaces
	 * @param {string} containerName The name of the service/container to run the command in
	 * @param {*} target The `<UUID.local>` of the target device
	 * @returns {string} output of the command that is executed on the targetted container of the device
	 * @category helper
	 */
	async executeCommandInContainer(command, containerName, target) {
		let ip = await this.ip(target);
		// get container ID
		const state = await rp({
			method: 'GET',
			uri: `http://${ip}:48484/v2/containerId`,
			json: true,
		});

		const stdout = await this.executeCommandInHostOS(
			`balena exec ${state.services[containerName]} ${command instanceof Array ? command.join(' ') : command
			}`,
			target,
		);
		return stdout;
	}

	/**
	 * Triggers a reboot on the target device and waits until the device comes back online
	 *
	 * @param {string} target
	 * @category helper
	 */
	async rebootDut(target) {
		console.log(`Rebooting the DUT`);
		await this.executeCommandInHostOS(
			`touch /tmp/reboot-check && systemd-run --on-active=2 reboot`,
			target,
		);
		await this.executeCommandInHostOS(
			'[[ ! -f /tmp/reboot-check ]] && echo pass',
			target,
		);
		console.log(`DUT has rebooted & is back online`);
	}

	/**
	 * Fetches OS version available on the DUT's `/etc/os-release` file
	 *
	 * @remark This method works entirely on the device though.
	 * @param {string} target
	 * @returns {string} returns OS version
	 * @category helper
	 */
	async getOSVersion(target) {
		// Could be used: https://github.com/balena-io/leviathan/blob/master/core/lib/components/balena/sdk.js#L210
		const output = await this.executeCommandInHostOS(
			'cat /etc/os-release',
			target,
		);
		let match;
		output.split('\n').every((x) => {
			if (x.startsWith('VERSION=')) {
				match = x.split('=')[1];
				return false;
			}
			return true;
		});
		return match.replace(/"/g, '');
	}

	/**
	 * Helper to archive the output of a HostOS command stored inside a file.
	 *
	 * @remark the default command that runs is `journalctl --no-pager --no-hostname -a -b all`
	 * @param {string} title The name of the directory in which logs will be archived. Usuallly
	 * this value is the name of the test suite (Available in the test using `this.id`)
	 * @param {string} target local UUID of the DUT, example:`${UUID}.local`
	 * @param {string} command The command you need to run and store output for.
	 * @category helper
	 */
	async archiveLogs(
		title,
		target,
		command = "journalctl --no-pager --no-hostname --list-boots | awk '{print $1}' | xargs -I{} sh -c 'set -x; journalctl --no-pager --no-hostname -a -b {} || true;'",
	) {
		const logFilePath = `/tmp/${command.split(' ')[0]}-${id()}.log`;
		console.log(
			`Retrieving ${command.split(' ')[0]} logs to the file ${logFilePath} ...`,
		);
		try {
			const commandOutput = await this.executeCommandInHostOS(
				`${command}`,
				target,
				{ interval: 5000, max_tries: 3 },
			);
			fs.writeFileSync(logFilePath, commandOutput);
			await archiver.add(title, logFilePath);
		} catch (e) {
			console.log(`Couldn't retrieve logs with error: ${e}`);
		}
	}
};
