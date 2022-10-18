/*
 * Copyright 2021 balena
 *
 * @license Apache-2.0
 */

'use strict';
const fse = require('fs-extra');
const { join } = require('path');
const { homedir } = require('os');
const { Worker, BalenaOS, Sdk, utils } = require('@balena/leviathan-test-helpers');

// required for unwrapping images
const imagefs = require('balena-image-fs');
const stream = require('stream');
const pipeline = require('bluebird').promisify(stream.pipeline);
const util = require('util');

// copied from the SV
// https://github.com/balena-os/balena-supervisor/blob/master/src/config/backends/config-txt.ts
// TODO: retrieve this from the SDK (requires v16.2.0) or future versions of device contracts
// https://www.balena.io/docs/reference/sdk/node-sdk/#balena.models.config.getConfigVarSchema
const supportsBootConfig = deviceType => {
	return (
		[
			'fincm3',
			'rt-rpi-300',
			'243390-rpi3',
			'nebra-hnt',
			'revpi-connect',
			'revpi-core-3',
		].includes(deviceType) || deviceType.startsWith('raspberry')
	);
};

const enableSerialConsole = async imagePath => {
	const bootConfig = await imagefs.interact(imagePath, 1, async _fs => {
		return util
			.promisify(_fs.readFile)('/config.txt')
			.catch(err => {
				console.error(err);
				return undefined;
			});
	});

	if (bootConfig) {
		await imagefs.interact(imagePath, 1, async _fs => {
			const regex = /^enable_uart=.*$/m;
			const value = 'enable_uart=1';

			console.log(`Setting ${value} in config.txt...`);

			// delete any existing instances before appending to the file
			const newConfig = bootConfig.toString().replace(regex, '');
			await util.promisify(_fs.writeFile)(
				'/config.txt',
				newConfig.concat(`\n\n${value}\n\n`),
			);
		});
	}
};

module.exports = {
	title: 'Testbot Diagnostics',
	run: async function (test) {
		// The worker class contains methods to interact with the DUT, such as flashing, or executing a command on the device
		// const Worker = this.require('common/worker');
		// The balenaOS class contains information on the OS image to be flashed, and methods to configure it
		// const BalenaOS = this.require('components/os/balenaos');
		// The `BalenaSDK` class contains an instance of the balena sdk, as well as some helper methods to interact with a device via the cloud.
		// const Balena = this.require('components/balena/sdk');
		await fse.ensureDir(this.suite.options.tmpdir);

		// The suite contex is an object that is shared across all tests. Setting something into the context makes it accessible by every test
		this.suite.context.set({
			utils: utils,
			sshKeyPath: join(homedir(), 'id'),
			sshKeyLabel: this.suite.options.id,
			sdk: new Sdk(this.suite.options?.balena?.apiUrl, this.getLogger()),
			link: `${this.suite.options.balenaOS.config.uuid.slice(0, 7)}.local`,
			worker: new Worker(
				this.suite.deviceType.slug,
				this.getLogger(),
				this.suite.options.workerUrl,
				this.suite.options.balena.organization,
				join(homedir(), 'id'),
			),
		});

		// Network definitions - here we check what network configuration is selected for the DUT for the suite, and add the appropriate configuration options (e.g wifi credentials)
		if (this.suite.options.balenaOS.network.wired === true) {
			this.suite.options.balenaOS.network.wired = {
				nat: true,
			};
		} else {
			delete this.suite.options.balenaOS.network.wired;
		}
		if (this.suite.options.balenaOS.network.wireless === true) {
			this.suite.options.balenaOS.network.wireless = {
				ssid: this.suite.options.id,
				psk: `${this.suite.options.id}_psk`,
				nat: true,
			};
		} else {
			delete this.suite.options.balenaOS.network.wireless;
		}

		const keys = await this.utils.createSSHKey(this.sshKeyPath);

		// Create an instance of the balenaOS object, containing information such as device type, and config.json options
		this.suite.context.set({
			os: new BalenaOS(
				{
					deviceType: this.suite.deviceType.slug,
					network: this.suite.options.balenaOS.network,
					image:
						this.suite.options.image === false
							? `${await this.context
								.get()
								.sdk.fetchOS(
									this.suite.options.balenaOS.download.version,
									this.suite.deviceType.slug,
								)}`
							: undefined,
					configJson: {
						uuid: this.suite.options.balenaOS.config.uuid,
						os: {
							sshKeys: [keys.pubKey],
						},
						// Set an API endpoint for the HTTPS time sync service.
						apiEndpoint: 'https://api.balena-cloud.com',
						// persistentLogging is managed by the supervisor and only read at first boot
						persistentLogging: true,
						// Create a development image, to get serial logging from the DUT
						developmentMode: true,
						// Set local mode so we can perform local pushes of containers to the DUT
						localMode: true,
					},
				},
				this.getLogger(),
			),
		});

		// Register a teardown function execute at the end of the test, regardless of a pass or fail
		this.suite.teardown.register(() => {
			this.log('Worker teardown');
			return this.worker.teardown();
		});

		this.log('Setting up worker');

		// Get worker setup info
		this.suite.context.set({
			workerContract: await this.worker.getContract(),
		});

		// Create network AP on testbot
		await this.worker.network(this.suite.options.balenaOS.network);

		// Unpack OS image .gz
		await this.os.fetch();

		// If this is a flasher image, and we are using qemu, unwrap
		if (
			this.suite.deviceType.data.storage.internal &&
			this.workerContract.workerType === `qemu`
		) {
			const RAW_IMAGE_PATH = `/opt/balena-image-${this.suite.deviceType.slug}.balenaos-img`;
			const OUTPUT_IMG_PATH = '/data/downloads/unwrapped.img';
			console.log(`Unwrapping file ${this.os.image.path}`);
			console.log(`Looking for ${RAW_IMAGE_PATH}`);
			try {
				await imagefs.interact(this.os.image.path, 2, async fsImg => {
					await pipeline(
						fsImg.createReadStream(RAW_IMAGE_PATH),
						fse.createWriteStream(OUTPUT_IMG_PATH),
					);
				});

				this.os.image.path = OUTPUT_IMG_PATH;
				console.log(`Unwrapped flasher image!`);
			} catch (e) {
				// If the outer image doesn't contain an image for installation, ignore the error
				if (e.code === 'ENOENT') {
					console.log('Not a flasher image, skipping unwrap');
				} else {
					throw e;
				}
			}
		}

		if (supportsBootConfig(this.suite.deviceType.slug)) {
			await enableSerialConsole(this.os.image.path);
		}

		this.log('Logging into balena with balenaSDK');
		await this.context
			.get()
			.sdk.balena.auth.loginWithToken(this.suite.options.balena.apiKey);
		this.log(`Logged in with ${await this.context.get().sdk.balena.auth.whoami()}'s account on ${this.suite.options.balena.apiUrl} using balenaSDK`);
		await this.context
			.get()
			.sdk.balena.models.key.create(this.sshKeyLabel, keys.pubKey);
		this.suite.teardown.register(() => {
			return Promise.resolve(
				this.context.get().sdk.removeSSHKey(this.sshKeyLabel),
			);
		});

		// Configure OS image
		await this.os.configure();

		// Retrieving journalctl logs - Uncomment if needed for debugging
		// Overkill quite frankly, since we aren't testing the OS and if testbot fails e2e
		// suite due to h/w issues then archiveLogs will block suite teardown frequently
		// this.suite.teardown.register(async () => {
		// 	await this.context
		// 		.get()
		// 		.worker.archiveLogs(this.id, this.context.get().link);
		// });
	},
	tests: ['./tests/always-fail', './tests/flash', './tests/power-cycle', './tests/serial'],
};
