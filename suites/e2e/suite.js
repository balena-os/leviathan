/*
 * Copyright 2018 balena
 *
 * @license Apache-2.0
 */

'use strict';

const fse = require('fs-extra');
const { join } = require('path');
const { homedir } = require('os');

module.exports = {
	title: 'Testbot Diagnositcs',
	run: async function() {
		// The worker class contains methods to interact with the DUT, such as flashing, or executing a command on the device
		const Worker = this.require('common/worker');
		// The balenaOS class contains information on the OS image to be flashed, and methods to configure it
		const BalenaOS = this.require('components/os/balenaos');
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

// Downloads the balenaOS image that will be flashed to the DUT 
// This is optional, you can provide your own balenaOS images as well. 
const path = await this.context
.get()
.sdk.fetchOS(
	this.suite.options.balenaOS.download.version,
	this.suite.deviceType.slug,
);

		// Create an instance of the balenOS object, containing information such as device type, and config.json options
		this.suite.context.set({
			os: new BalenaOS(
				{
					deviceType: this.suite.deviceType.slug,
					network: this.suite.options.balenaOS.network,
					image: `${path}`,
					configJson: {
						uuid: this.suite.options.balenaOS.config.uuid,
						os: {
							sshKeys: [
								await this.context
									.get()
									.utils.createSSHKey(this.context.get().sshKeyPath),
							],
						},
						// persistentLogging is managed by the supervisor and only read at first boot
						persistentLogging: true,
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

		// Create network AP on testbot
		await this.context
			.get()
			.worker.network(this.suite.options.balenaOS.network);

		// Unpack OS image .gz
		await this.context.get().os.fetch();

		// Configure OS image
		await this.context.get().os.configure();

		// Retrieving journalctl logs
		// Overkill quite frankly, since we aren't testing the OS and if testbot fails e2e 
		// suite due to h/w issues then archiveLogs will block suite teardown frequently
		// this.suite.teardown.register(async () => {
		// 	await this.context
		// 		.get()
		// 		.worker.archiveLogs(this.id, this.context.get().link);
		// });
	},
	tests: ['./tests/flash', './tests/power-cycle', './tests/serial'],
};
