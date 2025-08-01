/**
 * # balenaSDK helpers
 *
 * The `BalenaSDK` class contains an instance of the balena sdk, as well as some helper methods to interact with a device via the cloud.
 * The `balena` attribute of the class contains the sdk,and can be used as follows in a test suite:
 *
 * @example
 * ```js
 * const Cloud = this.require("components/balena/sdk");
 *
 * this.suite.context.set({
 *  cloud: new Balena("https://api.balena-cloud.com/", this.getLogger())
 * });
 *
 * // login
 * await this.context
 *  .get()
 *  .cloud.balena.auth.loginWithToken(this.suite.options.balena.apiKey);
 *
 * // create a balena application
 * await this.context.get().cloud.balena.models.application.create({
 * 	name: `NAME`,
 * 	deviceType: `DEVICE_TYPE`,
 *  organization: `ORG`,
 * });
 * ```
 *
 * @module balenaSDK helpers
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

const map = require('lodash/map');
const pick = require('lodash/pick');
const find = require('lodash/find');
const flatMapDeep = require('lodash/flatMapDeep');
const fs = require('fs');
const { join } = require('path');
const util = require('util');
const { pipeline } = require('node:stream/promises');
const retry = require('bluebird-retry');
const utils = require('../../common/utils');
const { spawn } = require('child_process')
const exec = util.promisify(require('child_process').exec);
const config = require('../../config');
const { toInteger } = require('lodash');
const { getSdk } = require('balena-sdk');

module.exports = class BalenaSDK {
	constructor(
		apiUrl,
		logger = { log: console.log, status: console.log, info: console.log },
		sshConfig = {}
	) {
		this.balena = getSdk({
			apiUrl: `https://api.${apiUrl}`,
		});
		this.apiUrl = apiUrl
		this.pine = this.balena.pine;
		this.logger = logger;
		this.sshConfig = {
			host: sshConfig.host || 'ssh.balena-devices.com',
			port: sshConfig.port || 22
		}
	}

	/**
	 * Executes command-line operations in the host OS of the DUT. Assuming the DUT is a managed device.
	 *
	 * @param {string} command command to be executed on the DUT
	 * @param {string} device local UUID of the DUT, example:`${UUID}.local`
	 * @param {{"interval": number, "tries": number}} timeout object containing details of how many times the command needs to be retried and the intervals between each command execution
	 * @returns {string} Output of the command that was exected on hostOS of the DUT
	 *
	 * @category helper
	 */
	async executeCommandInHostOS(
		command,
		device,
		timeout = {
			interval: 1000,
			tries: 600,
		},
	) {

		return retry(
			async () => {
				if (!(await this.balena.models.device.isOnline(device))) {
					throw new Error(`${device}: is not marked as connected to our VPN.`);
				}

				const result = await utils.executeCommandOverSSH(
					`host -s ${device} source /etc/profile ; ${command}`,
					{
						host: this.sshConfig.host,
						username: (await this.balena.auth.whoami()).username,
						port: this.sshConfig.port,
					},
				);

				if (result.code !== 0) {
					throw new Error(
						`"${command}" failed. stderr: ${result.stderr}, stdout: ${result.stdout}, code: ${result.code}`,
					);
				}

				return result.stdout;
			},
			{
				max_tries: timeout.tries,
				interval: timeout.interval,
				throw_original: true,
			},
		);
	}

	/**
	 * Creates application for a devicetype with the required config
	 *
	 * @param {string} name Name of the application that needs to be created
	 * @param {string} deviceType The device type for which application needs to be created
	 * @param {object} appConfig specify configuration needed for the application
	 *
	 * @category helper
	 */
	async createApplication(name, deviceType, appConfig) {
		this.logger.log(
			`Creating application: ${name} with device type ${deviceType}`,
		);

		await this.balena.models.application.create({
			name: name,
			deviceType: deviceType,
		});

		if (appConfig.delta) {
			this.logger.log(
				appConfig.delta === '1' ? 'Enabling delta' : 'Disabling delta',
			);
			await balena.models.application.configVar.set(
				name,
				'RESIN_SUPERVISOR_DELTA',
				appConfig.delta,
			);
		}
	}

	/**
		* Removes SSH key from balenaCloud account
		*
		* @param {string} label SSH key label
		*
		* @category helper
		*/
	async removeSSHKey(label) {
		this.logger.log(`Delete SSH key with label: ${label}`);

		const keys = await this.balena.models.key.getAll();
		const key = find(keys, {
			title: label,
		});

		if (key) {
			return this.balena.models.key.remove(key.id);
		}

		return Promise.resolve()
	}

	/**
	 * Pushes a release to an application from a given directory for managed devices
	 * @param {string} application The balena application name to push the release to
	 * @param {string} directory The path to the directory containing the docker-compose/Dockerfile for the application and the source files
	 * @returns {string} returns release commit after `balena push` is complete
	 *
	 * @category helper
	 */
	async pushReleaseToApp(application, directory) {
		await new Promise(async (resolve, reject) => {
			let balenaPush = spawn('balena', [
				'push',
				application,
				'--source',
				directory,
				'--debug', 
				'-c'
			], { stdio: 'inherit', timeout: 1000 * 60 * 10 });

			balenaPush.on('exit', (code) => {
				if (code === 0) {
					resolve();
				} else {
					reject()
				}
			});
			balenaPush.on('error', (err) => {
				process.off('SIGINT', handleSignal);
				process.off('SIGTERM', handleSignal);
				reject(err);
			});
		});
		// check new commit of app
		let commit = await this.balena.models.application.getTargetReleaseHash(
			application,
		);
		return commit;
	}

	/**
	 * Waits until all given services are running on the device on the provided commit
	 * @param {string} uuid The UUID of the device
	 * @param {Array[string]} services An array of the service names
	 * @param {string} commit The release commit hash that services should be on
	 * @param {number} retries (optional) The number of attempts to retry. Retries are spaced 30s apart
	 * @returns {boolean} returns true if all services in the release commit are running on the device
	 *
	 * @category helper
	 */
	async waitUntilServicesRunning(uuid, services, commit, retries = 50) {
		await utils.waitUntil(
			async () => {
				let deviceServices =
					await this.balena.models.device.getWithServiceDetails(uuid);
				let running = false;
				running = services.every((service) => {
					return (
						deviceServices.current_services[service][0].status === 'Running' &&
						deviceServices.current_services[service][0].commit === commit
					);
				});
				return running;
			},
			false,
			retries,
		);
	}

	/**
	 * Executes the command in the targetted container of a device
	 * @param {string} command The command to be executed
	 * @param {string} containerName The name of the service/container to run the command in
	 * @param {string} uuid The UUID of the target device
	 * @returns {string} output of the command that is executed on the targetted container of the device
	 *
	 * @category helper
	 */
	async executeCommandInContainer(command, containerName, uuid) {
		// get the container ID of container through balena engine
		const containerId = await this.executeCommandInHostOS(
			`balena ps --format "{{.Names}}" | grep ${containerName}`,
			uuid,
		);

		const stdout = await this.executeCommandInHostOS(
			`balena exec ${containerId} ${command}`,
			uuid,
		);

		return stdout;
	}

	/**
	 * @param {string} uuid The UUID of the target device
	 * @param {string} contains The string to look for in the logs
	 * @param {number} _start (optional) start the search from this log
	 * @param {number} _end (optional) end the search at this log
	 * @returns {boolean} If device logs contain the string
	 *
	 * @category helper
	 */
	async checkLogsContain(uuid, contains, _start = null, _end = null) {
		let logs = await this.balena.logs.history(uuid);
		let logsMessages = logs.map((log) => {
			return log.message;
		});

		let startIndex = _start != null ? logsMessages.indexOf(_start) : 0;
		let endIndex =
			_end != null ? logsMessages.indexOf(_end) : logsMessages.length;
		let slicedLogs = logsMessages.slice(startIndex, endIndex);

		let pass = false;
		slicedLogs.forEach((element) => {
			if (element.includes(contains)) {
				pass = true;
			}
		});

		return pass;
	}

	/**
	 * @param {string} uuid UUID of the device
	 * @returns {Promise<string>} Returns the supervisor version on a device
	 *
	 * @category helper
	 */
	async getSupervisorVersion(uuid) {
		let checkName = await this.executeCommandInHostOS(
			`balena ps | grep balena_supervisor`,
			uuid,
		);
		let supervisorName =
			checkName !== '' ? `balena_supervisor` : `resin_supervisor`;
		let supervisor = await this.executeCommandInHostOS(
			`balena exec ${supervisorName} cat package.json | grep version`,
			uuid,
		);
		// The result takes the form - `"version": "12.3.5"` - so we must extract the version number
		supervisor = supervisor.split(' ');
		supervisor = supervisor[1].replace(`"`, ``);
		supervisor = supervisor.replace(`",`, ``);
		return supervisor;
	}

	/**
	 * Downloads provided version of balenaOS for the provided deviceType using balenaSDK
	 *
	 * @param versionOrRange The semver compatible balenaOS version that will be downloaded, example: `2.80.3+rev1`. Default value: `latest` where latest development variant of balenaOS will be downloaded.
	 * @param deviceType The device type for which balenaOS needs to be downloaded
	 * @param imageType Can be one of 'flasher', 'raw' or an empty string / null / undefined if wanting to use the default artifact
	 * @param osType Can be one of 'default', 'esr' or null to include all types
	 * @remarks Stores the downloaded image in `leviathan.downloads` directory,
	 * @throws Rejects promise if download fails. Retries thrice to download an image before giving up.
	 *
	 * @category helper
	 */
	async fetchOS(versionOrRange = 'latest', deviceType, imageType='', osType = 'default') {
		// normalize the version string/range, supports 'latest', 'recommended', etc
		const balenaSdkProd = getSdk({
			apiUrl: "https://api.balena-cloud.com",
		});

		// TODO: Catch a connection error here if it happens - although it doesn't seem to very often
		let version = await balenaSdkProd.models.os.getMaxSatisfyingVersion(
			deviceType,
			versionOrRange,
			osType,
		);

		// variant is deprecated in recent balenaOS releases but
		// if prod variant is still present after being normalized, replace it with dev
		version = version.replace('.prod', '.dev');

		const path = join(
			config.leviathan.downloads,
			`balenaOs-${version}.img`,
		);

		// Caching implementation if needed - Check https://github.com/balena-os/leviathan/issues/441
		let attempt = 0;
		const downloadLatestOS = async () => {
			attempt++;
			this.logger.log(
				`Fetching balenaOS version ${version}, attempt ${attempt}...`,
			);

			const downloadOpts = {
				deviceType: deviceType,
				version: version,
			}

			// If image type is not defined, or the env variable in the client isn't set
			// this value will be falsy - so we won't use the imageType arg with os.download - meaning we get the default artifact
			if(imageType){
				console.log(`Downloading non-default OS artifact: ${imageType}`)
				downloadOpts['imageType'] = imageType;
			}

			try {
				const downloadStream = await balenaSdkProd.models.os.download(downloadOpts);
				let progress = 0;
				downloadStream.on('progress', (data) => {
					if (data.percentage >= progress + 10) {
						console.log(
							`Downloading balenaOS image: ${toInteger(data.percentage) + '%'
							}`,
						);
						progress = data.percentage;
					}
				});

				// Without the timeout, if the connection dies mid download, the function will hang. 
				// The download stream doesn't seem to emit an error event in the case of ECONNRESET
				// 5 minutes is a fair timeout here, as usually if nothing goes wrong the download will be < 1 minute
				const timeout = setTimeout(() => {
					console.log('Download stream timed out');
					downloadStream.destroy(new Error('Download stream timed out'));
				}, 1000*60*5);
			
				const writeStream = fs.createWriteStream(path);
				await pipeline(downloadStream, writeStream);

				console.log(`Download Successful: ${path}`);
				clearTimeout(timeout);
				return path;
			} catch (e) {
				try {
					console.log('Image download failed, cleaning up incomplete file...');
					// Deleting incomplete file
					fs.unlinkSync(path)
					console.log(`Deleted ${path}`);
				} catch (unlinkError){
					 console.log(unlinkError.message);
        		}
				//Throw error if promise rejection is caught to retry
				throw new Error(e)
			}
		};
		// Use exponential backoff in the case of transient connectivity issues - 5s, 15s, 45s
		return retry(downloadLatestOS, { max_tries: 3, interval: 5000, backoff: 3 });
	}
};
