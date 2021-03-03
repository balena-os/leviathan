/*
 * Copyright 2018 balena
 *
 * @license Apache-2.0
 */

'use strict';

const fse = require('fs-extra');
const { join } = require('path');
const { homedir } = require('os');
const { getSdk } = require('balena-sdk');
const { exec } = require('mz/child_process');

module.exports = {
	title: 'Example test suite',
	run: async function(test) {
		const Worker = this.require('common/worker'); // this lets us use the worker methods (e.g on, off, flash)

		await fse.ensureDir(this.suite.options.tmpdir); //  ensures that a directory exists

		//  set context - the attributes of this object are accessible in all of the tests - use set() to add to it, and get() to take from it
		this.suite.context.set({
			// These can be named whatever you want, and you don't have to use them
			balena: {
				sdk: getSdk({
					apiUrl: 'https://api.balena-cloud.com/',
				}),
				sshKey: { label: this.suite.options.id },
			},
			sshKeyPath: join(homedir(), 'id'),
			utils: this.require('common/utils'),
			worker: new Worker(this.suite.deviceType.slug, this.getLogger()),
			deviceType: this.suite.deviceType.slug,
		});

		this.suite.context.set({
			// add this so what we can access it from other places
			app_name: 'leviathan-test-app',
		});

		// login to sdk - there are helper functions to do this
		this.log('Login SDK');
		this.log(this.suite.options.balena.apiKey);
		await this.context
			.get()
			.balena.sdk.auth.loginWithToken(this.suite.options.balena.apiKey);

		// create an app
		this.log('Creating app');
		await this.context
			.get()
			.balena.sdk.models.application.create({
				name: this.suite.context.get().app_name,
				deviceType: this.suite.deviceType.slug,
				organization: 'gh_rcooke_warwick',
			})
			.then(function(application) {
				console.log(application);
			});

		this.teardown.register(() => {
			return this.context
				.get()
				.balena.sdk.models.application.remove(
					this.suite.context.get().app_name,
				);
		});

		// download os
		this.log('downloading os');
		/* await this.context.get().balena.sdk.models.os.download(this.suite.deviceType.slug).then(function(stream) {
			stream.pipe(fse.createWriteStream('/data/image'));
		}); */
		await exec(
			'balena os download raspberrypi3 -o /data/image --version v2.58.3+rev1.dev',
		);

		if (this.suite.options.balenaOS.network.wireless === true) {
			this.suite.options.balenaOS.network.wireless = {
				ssid: this.suite.options.id,
				psk: `${this.suite.options.id}_psk`,
				nat: true,
			};
		}

		this.log('Setting up worker');
		await this.context
			.get()
			.worker.network(this.suite.options.balenaOS.network);

		// configure os for app - in the helper functions in core/components/os, there is a method to configure()
		this.log('Login CLI');
		await exec(`balena login --token ${this.suite.options.balena.apiKey}`);
		this.log('Configure image');
		await exec(
			`balena os configure /data/image -a ${
				this.suite.context.get().app_name
			} --config-network wifi --config-wifi-key ${
				this.suite.options.balenaOS.network.wireless.psk
			}  --config-wifi-ssid ${
				this.suite.options.balenaOS.network.wireless.ssid
			}  `,
		); // need version - this is why we extract it in balenaos.js

		// flash image to DUT
		this.log('Begin flashing');
		await this.context.get().worker.off(); // Ensure DUT is off before starting tests
		await this.context.get().worker.flash('/data/image');
		await this.context.get().worker.on();

		// check to see if the device is on the dashboard
		this.log('Waiting for device to be reachable');
		let online = false;
		let uuid = null;
		while (online === false) {
			await this.context
				.get()
				.balena.sdk.models.device.getAllByApplication(
					this.suite.context.get().app_name,
				)
				.then(function(devices) {
					if (devices.length !== 0) {
						online = devices[0].is_online;
						if (online === true) {
							uuid = devices[0].uuid;
						}
					}
				});
		}

		this.suite.context.set({
			uuid: uuid,
		});
		this.log(`Device uuid is ${this.suite.context.get().uuid}`);

		this.suite.teardown.register(() => {
			this.log('Removing image');
			fse.unlinkSync('/data/image'); // Delete the unpacked an modified image from the testbot cache to prevent use in the next suite
			this.context.get().balena.sdk.models.device.remove(uuid);
			this.log('Worker teardown');
			return this.context.get().worker.teardown();
		});

		test.is(8, 8, 'The device is provisioned an online');
		test.afterEach((done, test) => {
			this.log('This has happened after a test');
			done();
		});
	},
	tests: ['./tests/example-test', './tests/move-test'],
};
