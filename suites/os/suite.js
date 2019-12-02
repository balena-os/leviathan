/*
 * Copyright 2018 balena
 *
 * @license Apache-2.0
 */

'use strict';

const assert = require('assert');
const fse = require('fs-extra');
const { join } = require('path');
const { homedir } = require('os');

module.exports = {
	title: 'BalenaOS release suite',
	run: async function() {
		const Worker = this.require('common/worker');
		const BalenaOS = this.require('components/os/balenaos');

		await fse.ensureDir(this.suite.options.tmpdir);

		this.suite.context.set({
			utils: this.require('common/utils'),
			sshKeyPath: join(homedir(), 'id'),
			link: `${this.suite.options.balenaOS.config.uuid.slice(0, 7)}.local`,
			worker: new Worker(this.suite.deviceType.slug),
		});
		// Network definitions
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

		this.suite.context.set({
			os: new BalenaOS({
				deviceType: this.suite.deviceType.slug,
				network: this.suite.options.balenaOS.network,
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
				},
			}),
		});

		this.suite.teardown.register(() => {
			console.log('Worker teardown');
			return this.context.get().worker.teardown();
		});
		console.log('Setting up worker');
		await this.context.get().worker.select({
			type: this.suite.options.worker.type,
			options: {
				network: {
					wireless: 'wlan0',
				},
				screen: true,
			},
		});
		await this.context
			.get()
			.worker.network(this.suite.options.balenaOS.network);

		await this.context.get().os.fetch({
			type: this.suite.options.balenaOS.download.type,
			version: this.suite.options.balenaOS.download.version,
		});
		await this.context.get().worker.flash(this.context.get().os);
		await this.context.get().worker.on();

		console.log('Waiting for device to be reachable');
		assert.equal(
			await this.context
				.get()
				.worker.executeCommandInHostOS(
					'cat /etc/hostname',
					this.context.get().link,
				),
			this.context.get().link.split('.')[0],
			'Device should be reachable',
		);
	},
	tests: [
		'./tests/led',
		'./tests/config-json',
		'./tests/boot-splash',
		'./tests/connectivity',
	],
};
