/*
 * Copyright 2021 balena
 *
 * @license Apache-2.0
 */

'use strict';
const fse = require('fs-extra');
const { join } = require('path');
const { homedir } = require('os');

// required for unwrapping images
const imagefs = require('balena-image-fs');
const stream = require('stream')
const pipeline = require('bluebird').promisify(stream.pipeline);

module.exports = {
	title: 'Testbot Diagnositcs',
	run: async function (test) {
		// The worker class contains methods to interact with the DUT, such as flashing, or executing a command on the device
		const Worker = this.require('common/worker');
		// The balenaOS class contains information on the OS image to be flashed, and methods to configure it
		const BalenaOS = this.require('components/os/balenaos');
		// The `BalenaSDK` class contains an instance of the balena sdk, as well as some helper methods to interact with a device via the cloud.
		const Balena = this.require('components/balena/sdk');
		await fse.ensureDir(this.suite.options.tmpdir);

		// The suite contex is an object that is shared across all tests. Setting something into the context makes it accessible by every test
		this.suite.context.set({
			utils: this.require('common/utils'),
			sshKeyPath: join(homedir(), 'id'),
			sdk: new Balena(this.suite.options.balena.apiUrl, this.getLogger()),
			link: `${this.suite.options.balenaOS.config.uuid.slice(0, 7)}.local`,
			worker: new Worker(this.suite.deviceType.slug, this.getLogger()),
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

		// Create an instance of the balenaOS object, containing information such as device type, and config.json options
		this.suite.context.set({
			os: new BalenaOS(
				{
					deviceType: this.suite.deviceType.slug,
					network: this.suite.options.balenaOS.network,
					image: this.suite.options.image === 'false' ? `${await this.context
						.get()
						.sdk.fetchOS(
							this.suite.options.balenaOS.download.version,
							this.suite.deviceType.slug,
						)}` : undefined,
					configJson: {
						uuid: this.suite.options.balenaOS.config.uuid,
						os: {
							sshKeys: [
								await this.context
									.get()
									.utils.createSSHKey(this.context.get().sshKeyPath),
							],
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
			return this.context.get().worker.teardown();
		});

		this.log('Setting up worker');

		// Get worker setup info
		this.suite.context.set({
			workerContract: await this.context.get().worker.getContract()
		})

		// Create network AP on testbot
		await this.context
			.get()
			.worker.network(this.suite.options.balenaOS.network);

		// Unpack OS image .gz
		await this.context.get().os.fetch();

		// If this is a flasher image, and we are using qemu, unwrap
		if (this.suite.deviceType.data.storage.internal && (process.env.WORKER_TYPE === `qemu`)) {
			const RAW_IMAGE_PATH = `/opt/balena-image-${this.suite.deviceType.slug}.balenaos-img`
			const OUTPUT_IMG_PATH = '/data/downloads/unwrapped.img'
			console.log(`Unwrapping file ${this.context.get().os.image.path}`)
			console.log(`Looking for ${RAW_IMAGE_PATH}`)
			try {
				await imagefs.interact(this.context.get().os.image.path, 2, async (fsImg) => {
					await pipeline(
						fsImg.createReadStream(RAW_IMAGE_PATH),
						fse.createWriteStream(OUTPUT_IMG_PATH)
					)
				})

				this.context.get().os.image.path = OUTPUT_IMG_PATH;
				console.log(`Unwrapped flasher image!`);
			} catch (e) {
				// If the outer image doesn't contain an image for installation, ignore the error
				if (e.code === 'ENOENT') {
					console.log("Not a flasher image, skipping unwrap");
				} else {
					throw e;
				}
			}
		}

		// Configure OS image
		await this.context.get().os.configure();

		// Retrieving journalctl logs - Uncomment if needed for debugging
		// Overkill quite frankly, since we aren't testing the OS and if testbot fails e2e
		// suite due to h/w issues then archiveLogs will block suite teardown frequently
		// this.suite.teardown.register(async () => {
		// 	await this.context
		// 		.get()
		// 		.worker.archiveLogs(this.id, this.context.get().link);
		// });
	},
	tests: ['./tests/flash',
		'./tests/power-cycle',
		'./tests/serial'
	],
};
