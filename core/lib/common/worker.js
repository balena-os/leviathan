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
const { getSdk } = require('balena-sdk');

function id() {
	return `${Math.random().toString(36).substring(2, 10)}`;
}

async function doRequest(options, tries = 5, interval = 1000 * 2) {
	return retry(
		async () => {
			console.log(`${options.method ? options.method : 'GET'} ${options.uri ? options.uri : options}`);
			return rp(options);
		},
		{
			max_tries: tries,
			interval: interval,
			throw_original: true,
		}
	)
}

module.exports = class Worker {
	constructor(
		deviceType,
		logger = { log: console.log, status: console.log, info: console.log },
		url,
		username,
		sshKey,
		sshConfig = {}
	) {
		this.deviceType = deviceType;
		this.url = url;
		this.logger = logger;
		this.username = username;
		this.sshKey = sshKey;
		this.dutSshKey = `/tmp/id`;
		this.logger = logger;
		this.proxySshConfig = {
			host: sshConfig.host || 'ssh.balena-devices.com',
			port: sshConfig.port || 22
		}
		// unless over-ridden by local IP communication to worker, by deafult use the proxy to SSH into worker
		this.workerHost = this.proxySshConfig.host
		this.workerPort = this.proxySshConfig.port
		// Port on the worker used for port forwarding
		this.workerTunnelPort = 8888
		this.workerUser = 'root';
		this.sshPrefix = '';
		this.uuid = '';
		this.localConnect = false;

		// This checks core + worker are running on the same machine. Example: QEMU
		this.directConnect = (
			this.url.includes(`worker`)
			|| this.url.includes('unix:')
		);

		if (!this.directConnect) {
			// Regular expression to match URLs starting with http:// followed by an IP address
			const ipRegex = /http:\/\/(\d+\.\d+\.\d+\.\d+)/;

			// Check if the URL is an IP address
			const match = this.url.match(ipRegex);

			// If it is balenaCloud URL
			if (!match) {
				this.uuid = this.url.match(
					/https:\/\/([^\.]+)\./,
				)[1];
				this.sshPrefix = `host ${this.uuid} `;
				this.workerUser = this.username;
			}
			// If it is local IP
			else if (match) {
				const ipAddress = match[1];
				console.log(`Setting URL as IP address: ${ipAddress}`);
				this.workerUser = 'root';
				this.workerPort = 22222;
				this.workerTunnelPort = 22222;
				this.workerHost = ipAddress;
				this.localConnect = true
			}

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
		let attempt = 0;
		await retry(
			async () => {
				attempt++;
				this.logger.log(`Preparing to flash, attempt ${attempt}...`);

				await new Promise(async (resolve, reject) => {
					const req = rp.post({ uri: `${this.url}/dut/flash`, timeout: 0 });

					req.catch((error) => {
						this.logger.log(`client side error: `)
						this.logger.log(error.message)
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

					pipeline(
						fs.createReadStream(imagePath),
						createGzip({ level: 6 }),
						req,
					);
				});
				this.logger.log('Flash completed');
			},
			{
				max_tries: 5,
				interval: 1000 * 5,
				throw_original: true,
			},
		);
	}


	/**
	 * Turn the DUT on
	 *
	 * @category helper
	 */
	async on() {
		this.logger.log('Powering on DUT');
		await doRequest({ method: 'POST', uri: `${this.url}/dut/on` });
		this.logger.log('DUT powered on');
	}

	async fetchSerial() {
		this.logger.log('Pulling Serial logs from DUT');
		// Logs received were encoding 'UTF-16LE', hence need to convert them right here.
		return Buffer.from(await doRequest(
			`${this.url}/dut/serial`),
			'utf-8'
		).toString();
	}

	/**
	 * Turn the DUT off
	 *
	 * @category helper
	 */
	async off() {
		this.logger.log('Powering off DUT');
		await doRequest({ method: 'POST', uri: `${this.url}/dut/off` });
		this.logger.log('DUT powered off');
	}

	/**
	 * Gather diagnostics from testbot
	 */
	async diagnostics() {
		return JSON.parse(
			await doRequest({ uri: `${this.url}/dut/diagnostics` })
		);
	}

	async network(network) {
		await doRequest({
			method: 'POST',
			uri: `${this.url}/dut/network`,
			body: network,
			json: true,
		});
	}

	proxy(proxy) {
		return doRequest({ method: 'POST', uri: `${this.url}/proxy`, body: proxy, json: true });
	}

	// the default doRequest parameters lead to 5 retries
	// the /dut/ip endpoint takes around 10s to scan on the worker side
	// setting tries to 50 here leads to 50*([default doRequest interval = 2] + ~10) = 600s/10 mins
	async getDutIp(
		target,
		tries = 50
	) {
		return doRequest({
			uri: `${this.url}/dut/ip`,
			body: { target },
			json: true,
		},
		tries
		);
	}

	async ip(target) {
		// ip of DUT - used to talk to it
		// if testbot/local testbot, then we dont wan't the ip, as we use SSH tunneling to talk to it - so return 127.0.0.1
		// if qemu, return the ip - as we talk to the DUT directly
		return this.directConnect
			? this.getDutIp(target)
			: Promise.resolve(`127.0.0.1`);
	}

	async teardown() {
		await doRequest({ method: 'POST', uri: `${this.url}/teardown`, json: true });
	}

	async getContract() {
		return doRequest({ uri: `${this.url}/contract`, json: true });
	}

	async capture(action) {
		switch (action) {
			case 'start':
				return doRequest({ method: 'POST', uri: `${this.url}/dut/capture`, json: true });
			case 'stop':
				// have to receive tar.gz and unpack them? then return path to directory for the test to consume
				let capture = request.get({ uri: `${this.url}/dut/capture` });
				return pipeline(capture, createGunzip(), tar.extract('/tmp/capture'));
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
	 * @param {{"interval": number, "tries": number}} retryOptions object containing details of how many times the
	 * command needs to be retried and the intervals between each command execution
	 * @returns {string} Output of the command that was exected on hostOS of the DUT
	 *
	 * @category helper
	 */
	async executeCommandInHostOS(command, target, retryOptions = {}) {
		if (target === 'serial') {
			let result = await doRequest({
				method: 'POST',
				uri: `${this.url}/dut/serial/exec`,
				body: { cmd: command },
				json: true
			});
			return result
		} else {
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
					host: this.proxySshConfig.host,
					port: this.proxySshConfig.port,
					username: this.username,
				};
				console.log('SSH attempt to DUT over proxy: ')
				console.log(config)
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
	}

	async executeCommandOverSerial(command) {
		let result = await doRequest({
			method: 'POST',
			uri: `${this.url}/dut/serial/exec`,
			body: { cmd: command },
			json: true
		});
		return result
	}

	async executeCommandInWorkerHost(command, retryOptions = {}) {
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
	async executeCommandInWorker(command, retryOptions = {}) {
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
		let tunnelIp = this.localConnect ? this.workerHost : '127.0.0.1';

		// This creates a reverse tunnel to the specified port on the DUT, via the worker
		let ip = await this.getDutIp(target);
		let argsWorker = [
			`-L`,
			`${dutPort}:${ip}:${dutPort}`,
			`-p`,
			workerPort,
			`${this.username}@${tunnelIp}`,
			`-o`,
			`StrictHostKeyChecking=no`,
			`-o`,
			`UserKnownHostsFile=/dev/null`,
			`-i`,
			this.sshKey,
			`-N`
		];
		console.log(argsWorker)
		let tunnelProWorker = spawn(`ssh`, argsWorker);
	}

	// create tunnels to relevant DUT ports to we can access them remotely
	async createSSHTunnels(target) {
		if (!this.directConnect) {
			const DUT_PORTS = [
				48484, // supervisor
				22222, // ssh
				2375, // engine
			];

			// If we are connecting to the worker over balena cloud proxy, and not local ip, then use balena tunnel to tunnel to worker
			// This makes the worker SSH port accessible to the core
			if(!this.localConnect){
				let argsClient = [
					`tunnel`,
					this.uuid,
					`-p`,
					`22222:127.0.0.1:${this.workerTunnelPort}`
				];
				let tunnelProcClient = spawn(`balena`, argsClient, {stdio: 'inherit'});
			}

			// This short delay is to wait for the balena tunnel to be established
			await Bluebird.delay(1000*10)

			for (let port of DUT_PORTS) {
				console.log(`creating tunnel to dut port ${port}...`);
				await this.createTunneltoDUT(target, port, this.workerTunnelPort);
			}
		} else {
			// set up route to DUT via the worker ip
			console.log(`Getting ip of dut`)
			let dutIp = await this.ip(target);
			console.log(`getting ip of worker`)
			let workerIp = await exec(`dig +short worker`);
			console.log(`ip route add ${dutIp} via ${workerIp}`)
			// If the route already exists, do not throw an error
			try {
				await exec(`ip route add ${dutIp} via ${workerIp}`)
			} catch (e) {
				console.error(`Failed to add ip route: ${e}`);
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

	// add ssh key to the worker, so it can ssh into prod DUT's
	async addSSHKey(keyPath) {
		if (!this.directConnect) {
			console.log(`Adding dut ssh key to worker...`);
			const SSH_KEY_PATH = '/tmp/';
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
		this.logger.log(`Rebooting the DUT`);
		await this.executeCommandInHostOS(
			`touch /tmp/reboot-check && systemd-run --on-active=2 reboot`,
			target,
		);
		await this.executeCommandInHostOS(
			'[[ ! -f /tmp/reboot-check ]] && echo pass',
			target,
		);
		this.logger.log(`DUT has rebooted & is back online`);
	}

	/**
	 * Fetches OS version available on the DUT's `/etc/os-release` file
	 *
	 * @remarks This method works entirely on the device though.
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
	 * @remarks the default command that runs is `journalctl --no-pager --no-hostname -a -b all`
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
		this.logger.log(
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
			this.logger.log(`Couldn't retrieve logs with error: ${e}`);
		}
	}
};
