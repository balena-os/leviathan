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
const config = require('config');
const isNumber = require('lodash/isNumber');
const { fs } = require('mz');
const once = require('lodash/once');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const request = require('request');
const rp = require('request-promise');
const keygen = Bluebird.promisify(require('ssh-keygen'));

const exec = Bluebird.promisify(require('child_process').exec);
const { createGzip, createGunzip } = require('zlib');
const tar = require('tar-fs');

function id() {
	return `${Math.random().toString(36).substring(2, 10)}`;
}

module.exports = class Worker {
	constructor(
		deviceType,
		logger = { log: console.log, status: console.log, info: console.log },
		url
	) {
		this.deviceType = deviceType;
		this.url = url;
		this.logger = logger;
	}

	/**
	 * Flash the provided OS image onto the connected DUT
	 *
	 * @param {string} imagePath path of the image to be flashed onto the DUT
	 *
	 * @category helper
	 */
	async flash(imagePath) {
		if (process.env.DEBUG_KEEP_IMG) {
			this.logger.log('[DEBUG] Skip flashing');
			return "Skipping flashing"
		} else {
			this.logger.log('Preparing to flash');

			await new Promise(async (resolve, reject) => {
				const req = rp.post({ uri: `${this.url}/dut/flash` });

				req.catch((error) => {
					reject(error);
				});
				req.finally(() => {
					if (lastStatus !== 'done') {
						reject(new Error('Unexpected end of TCP connection'));
					}

					resolve();
				});

				let lastStatus;
				req.on('data', (data) => {
					const computedLine = RegExp('(.+?): (.*)').exec(data.toString());

					if (computedLine) {
						if (computedLine[1] === 'error') {
							req.cancel();
							reject(new Error(computedLine[2]));
						}

						if (computedLine[1] === 'progress') {
							once(() => {
								this.logger.log('Flashing');
							});
							// Hide any errors as the lines we get can be half written
							const state = JSON.parse(computedLine[2]);
							if (state != null && isNumber(state.percentage)) {
								this.logger.status({
									message: 'Flashing',
									percentage: state.percentage,
								});
							}
						}

						if (computedLine[1] === 'status') {
							lastStatus = computedLine[2];
						}
					}
				});

				pipeline(fs.createReadStream(imagePath), createGzip({ level: 6 }), req);
			});
			this.logger.log('Flash completed');
		}
	}

	/**
	 * Turn the DUT on
	 *
	 * @category helper
	 */
	async on() {
		this.logger.log('Powering on DUT');
		await rp.post(`${this.url}/dut/on`);
		this.logger.log('DUT powered on');
	}

	/**
	 * Turn the DUT off
	 *
	 * @category helper
	 */
	async off() {
		this.logger.log('Powering off DUT');
		await rp.post(`${this.url}/dut/off`);
	}

	async network(network) {
		await rp.post({
			uri: `${this.url}/dut/network`,
			body: network,
			json: true,
		});
	}

	proxy(proxy) {
		return rp.post({ uri: `${this.url}/proxy`, body: proxy, json: true });
	}

	ip(
		target,
		timeout = {
			interval: 10000,
			tries: 60,
		},
	) {
		return /.*\.local/.test(target)
			? retry(
					() => {
						return rp.get({
							uri: `${this.url}/dut/ip`,
							body: { target },
							json: true,
						});
					},
					{
						max_tries: timeout.tries,
						interval: timeout.interval,
						throw_original: true,
					},
			  )
			: target;
	}

	async teardown() {
		await rp.post({ uri: `${this.url}/teardown`, json: true });
	}

	async getContract() {
		return rp.get({ uri: `${this.url}/contract`, json: true });
	}

	async capture(action) {
		switch (action) {
			case 'start':
				return rp.post({ uri: `${this.url}/dut/capture`, json: true });
			case 'stop':
				// have to receive tar.gz and unpack them? then return path to directory for the test to consume
				let capture = request.get({ uri: `${this.url}/dut/capture` });
				const line = pipeline(
					capture,
					createGunzip(),
					tar.extract('/data/capture')
				).catch(error => {throw error});
				await line;
		}
	}


	async sshSetup(){
		// create the ssh keys
		let keys = await keygen({location: '/tmp/testKeys'});

		await rp.post({
			uri: `${this.url}/ssh/setup`,
			body: { 
				id: keys.key,
				id_pub: keys.pubKey
			},
			json: true,
		})

		// return public ssh Key so that they can be added to image in test suite
		return keys.pubKey.trim()
	}
	
	/**
	 * Executes command-line operations in the host OS of the DUT. Assuming the DUT is
	 * connected to the access point broadcasted by the testbot:
	 *
	 * @example
	 * ```js
	 * const Worker = this.require('common/worker');
	 * const worker = new Worker(DEVICE_TYPE_SLUG, this.getLogger())
	 * await worker.executeCommandInHostOS('cat /etc/hostname', `${UUID}.local`);
	 * ```
	 *
	 * @param {string} command command to be executed on the DUT
	 * @param {string} target local UUID of the DUT, example:`${UUID}.local`
	 * @param {{"interval": number, "tries": number}} timeout object containing details of how many times the
	 * command needs to be retried and the intervals between each command execution
	 * @returns {string} Output of the command that was exected on hostOS of the DUT
	 *
	 * @category helper
	 */
	async executeCommandInHostOS(
		command,
		target,
		timeout = {
			interval: 10000,
			tries: 10,
		},
	) {
		return retry(
			async () => {
				let stdout = await rp.post({
					uri: `${this.url}/dut/exec`,
					body: { 
						target: target,
						cmd: command
					},
					json: true,
				})
				return stdout
			},
			{
				max_tries: timeout.tries,
				interval: timeout.interval,
				throw_original: true,
			},
		);
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
		// send files to the worker
		console.log(`Uploading files to worker...`)
		await new Promise(async (resolve, reject) => {
			const upload = request.post({
				uri: `${this.url}/dut/container/send`
			});
			upload.on('end', resolve).on('error', reject)

			const line = pipeline(
				tar.pack(source),
				createGzip({ level: 6 }),
				upload
			).catch(error => {throw error});
			await line;
    	});
    	console.log('Directory uploaded');
		
		console.log('Pushing container to DUT')
		let state = await rp.post({
			uri: `${this.url}/dut/container/push`,
			body: { 
				target: target,
				containerName: containerName
			},
			json: true,
		})
		return state;
	}

	/**
	 * Executes the command in the targeted container of a device
	 * @param {string} command The command to be executed
	 * @param {string} containerName The name of the service/container to run the command in
	 * @param {*} target The `<UUID.local>` of the target device
	 * @returns {string} output of the command that is executed on the targetted container of the device
	 * @category helper
	 */
	async executeCommandInContainer(command, containerName, target) {
		let stdout = await rp.post({
			uri: `${this.url}/dut/container/exec`,
			body: { 
				target: target,
				containerName: containerName,
				cmd: command
			},
			json: true,
		})
		return stdout;
	}

	async executeCommandOnWorker(command){
		let stdout = await rp.post({
			uri: `${this.url}/exec`,
			body: { 
				cmd: command
			},
			json: true,
		})
		return stdout;
	}

	/**
	 * Triggers a reboot on the target device and waits until the device comes back online
	 *
	 * @param {string} target
	 * @category helper
	 */
	async rebootDut(target) {
		this.logger.log(`Rebooting the DUT`);
		await this.executeCommandInHostOS(
			`touch /tmp/reboot-check && systemd-run --on-active=2 reboot`,
			target,
		);
		await utils.waitUntil(async () => {
			return (
				(await this.executeCommandInHostOS(
					'[[ ! -f /tmp/reboot-check ]] && echo pass',
					target,
				)) === 'pass'
			);
		}, false);
		this.logger.log(`DUT has rebooted & is back online`);
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
		command = 'journalctl --no-pager --no-hostname -a -b all',
	) {
		const logFilePath = `/tmp/${command.split(' ')[0]}-${id()}.log`;
		this.logger.log(
			`Retrieving ${command.split(' ')[0]} logs to the file ${logFilePath} ...`,
		);
		try {
			const commandOutput = await this.executeCommandInHostOS(
				`${command}`,
				target,
				{ interval: 10000, tries: 3 },
			);
			fs.writeFileSync(logFilePath, commandOutput);
			await archiver.add(title, logFilePath);
		} catch (e) {
			this.logger.log(`Couldn't retrieve logs with error: ${e}`);
		}
	}

	async httpFromWorker(method, uri, data={}){
		const result = await rp({
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			json: true,
			body: {
				method: method,
				data: data,
				uri: uri,
			},
			uri: this.url,
		});
		return result;
	}
};
