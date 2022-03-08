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
// const config = require('config');
const isNumber = require('lodash/isNumber');
const { fs } = require('mz');
const path = require('path');
const once = require('lodash/once');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const request = require('request');
const rp = require('request-promise');

const exec = Bluebird.promisify(require('child_process').exec);
const spawn = require('child_process').spawn;
const { createGzip, createGunzip } = require('zlib');
const tar = require('tar-fs');
const { getSdk } = require('balena-sdk');

function id() {
	return `${Math.random().toString(36).substring(2, 10)}`;
}

module.exports = class Worker {
	constructor(
		deviceType,
		logger = { log: console.log, status: console.log, info: console.log },
		url,
		username,
		sshKey,
	) {
		this.deviceType = deviceType;
		this.url = url;
		this.logger = logger;
		this.username = username;
		this.sshKey = sshKey;
		this.dutSshKey = `/tmp`;
		this.logger = logger;
		this.workerHost = new URL(this.url).hostname;
		this.workerPort = '22222';
		this.workerUser = 'root';
		this.sshPrefix = '';
		this.uuid = '';
		if (this.url.includes(`balena-devices.com`)) {
			// worker is a testbot connected to balena cloud - we ssh into it via the vpn
			this.uuid = this.url.match(
				/(?<=https:\/\/)(.*)(?=.balena-devices.com)/,
			)[1];
			this.workerHost = `ssh.balena-devices.com`;
			this.workerUser = this.username;
			this.workerPort = '22';
			this.sshPrefix = `host ${this.uuid} `;
		}
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
			return 'Skipping flashing';
		} else {
			let attempt = 0;
			await retry(async () => {
				attempt++;
				this.logger.log(`Preparing to flash, attempt ${attempt}...`);

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
			},
			{
				max_tries: 5,
				interval: 1000* 5,
				throw_original: true,
			})
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

	/**
	 * Gather diagnostics from testbot
	 */
	async diagnostics() {
		return JSON.parse(await rp.get(`${this.url}/dut/diagnostics`));
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

	async getDutIp(
		target,
		timeout = {
			interval: 10000,
			tries: 60,
		},
	) {
		return retry(
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
		);
	}

	ip(target) {
		// ip of DUT - used to talk to it
		// if testbot/local testbot, then we dont wan't the ip, as we use SSH tunneling to talk to it - so return 127.0.0.1
		// if qemu, return the ip - as we talk to the DUT directly
		return this.url.includes(`localhost`) ? this.getDutIp(target) : `127.0.0.1`;
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
				return pipeline(
					capture,
					createGunzip(),
					tar.extract('/tmp/capture'),
				);
		}
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
	async executeCommandInHostOS(command, target) {
		command = command instanceof Array ? command.join(' ') : command;
		let config = {};
		// depending on if the target argument is a .local uuid or not, SSH via the proxy or directly
		if (/.*\.local/.test(target)) {
			let ip = await this.ip(target);
			config = {
				host: ip, // the this.ip() method will return the DUT ip or localhost, depending on if its a virtual worker or not
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
				const result = await utils.executeCommandOverSSH(command, config);

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
			},
		);
	}

	async executeCommandInWorkerHost(command) {
		let config = {};
		const result = await utils.executeCommandOverSSH(
			`${this.sshPrefix}${command}`,
			{
				host: this.workerHost,
				port: this.workerPort,
				username: this.workerUser,
			},
		);

		return result.stdout;
	}

	// executes command in the worker container
	async executeCommandInWorker(command) {
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
			},
		);
	}

	// creates a tunnel a specified DUT port
	// In the case of a virtual worker, can we map the qemu devices ports directly, without this???
	async createTunneltoDUT(target, dutPort, workerPort) {
		let ip = await this.getDutIp(target);
		//get containerID of the worker container on the testbot - we must do socat from inside the worker container
		let containerId = await this.executeCommandInWorkerHost(
			`balena ps | grep worker | awk '{print $1}'`,
		);
		let argsWorker = [];
		argsWorker = argsWorker.concat([
			`${this.workerUser}@${this.workerHost}`,
			`-p`,
			this.workerPort,
			`-i`,
			this.sshKey,
			`-o`,
			`StrictHostKeyChecking=no`,
			`-o`,
			`UserKnownHostsFile=/dev/null`,
		]);

		if (this.sshPrefix !== '') {
			argsWorker = argsWorker.concat([`host`, this.uuid]);
		}

		argsWorker = argsWorker.concat([
			`balena`,
			`exec`,
			containerId,
			`socat`,
			`tcp-listen:${workerPort},reuseaddr,fork "system:ssh ${ip} -p 22222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i ${this.dutSshKey} /usr/bin/nc localhost ${dutPort}"`,
		]);

		let tunnelProWorker = spawn(`ssh`, argsWorker);

		// setup a listener from this host to worker must be a sub process...
		// we must give map the same port on this host and the DUT - so the cli can use it
		// this will be torn down at the end of the tests when the core is destroyed
		let argsClient = [
			`tcp-listen:${dutPort},reuseaddr,fork`,
			`system:ssh ${this.workerUser}@${this.workerHost} -p ${this.workerPort} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i ${this.sshKey} ${this.sshPrefix}/usr/bin/nc localhost ${workerPort}`,
		];

		let tunnelProcClient = spawn(`socat`, argsClient);
	}

	// create tunnels to relevant DUT ports to we can access them remotely
	async createSSHTunnels(target) {
		if (!this.url.includes(`localhost`)) {
			const DUT_PORTS = [
				48484, // supervisor
				22222, // ssh
				2375, // engine
			];
			let workerPort = 8888;
			for (let port of DUT_PORTS) {
				console.log(`creating tunnel to dut port ${port}...`);
				await this.createTunneltoDUT(target, port, workerPort);
				workerPort = workerPort + 1;
			}
		}
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

	// add ssh key to the worker, so it cas ssh into prod DUT's
	async addSSHKey(keyPath) {
		if (!this.url.includes(`localhost`)) {
			console.log(`Adding dut ssh key to worker...`);
			const SSH_KEY_PATH = '/tmp/';
			this.dutSshKey = `${SSH_KEY_PATH}${path.basename(keyPath)}`;
			await this.sendFile(keyPath, SSH_KEY_PATH, 'worker');
			await this.sendFile(
				keyPath,
				`${SSH_KEY_PATH}${path.basename(keyPath)}.pub`,
				'worker',
			);
			console.log(`ssh key added!`);
		}
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
		await retry(
			async () => {
				// if virtualised worker, push directly wo the DUT
				await exec(`balena push ${ip} --source ${source} --nolive --detached`);
			},
			{
				max_tries: 10,
				interval: 5000,
			},
		);
		// now wait for new container to be available
		let state = {};
		await utils.waitUntil(async () => {
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
			`balena exec ${state.services[containerName]} ${
				command instanceof Array ? command.join(' ') : command
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
					{ interval: 10000, tries: 10 },
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
};
