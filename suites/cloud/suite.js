/*
 * Copyright 2018 balena
 *
 * @license Apache-2.0
 */

'use strict';

const assert = require('assert');
const noop = require('lodash/noop');
const Bluebird = require('bluebird');
const fse = require('fs-extra');
const { join } = require('path');
const { homedir } = require('os');
const { exec } = require('mz/child_process');

module.exports = {
	title: 'Managed BalenaOS release suite',
	run: async function() {

		// we should have certain things imported by default - if you're writing a suite, you dont know where these modules are!
		const Worker = this.require('common/worker');
		const BalenaOS = this.require('components/os/balenaos');
		const Balena = this.require('components/balena/sdk');
		const CLI = this.require('components/balena/cli');
		//const DeviceApplication = this.require('components/balena/utils');

		//its not clear what suite.options is (its defined in conf.js)
		await fse.ensureDir(this.suite.options.tmpdir);

		// add objects to the context, so that they can be used across all the tests in this suite
		this.suite.context.set({
			cloud:  new Balena(this.suite.options.balena.apiUrl, this.getLogger()),
			balena: {
				application: this.suite.options.id,
				//deviceApplicationChain: new DeviceApplication().getChain(),
				sshKey: { label: this.suite.options.id },
			},
			cli: new CLI(this.getLogger()),
			sshKeyPath: join(homedir(), 'id'),
			utils: this.require('common/utils'), 
			worker: new Worker(this.suite.deviceType.slug, this.getLogger()),
		});

		// Network definitions - this is ugly, and should be wrapped up in one function
		// network_config(options) or something
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

		
		// login
		this.log('Logging in with SDK');
		await this.context
			.get()
			.cloud.balena.auth.loginWithToken(this.suite.options.balena.apiKey)

		// create a balena application
		this.log('Creating application in cloud...');
		await this.context
			.get()
			.cloud.balena.models.application.create({
				name: this.suite.context.get().balena.application,
				deviceType: this.suite.deviceType.slug,
				organization: 'gh_rcooke_warwick',
			})

		// remove application when tests are done
		this.suite.teardown.register(() => {
			this.log('Removing application');
			return this.context
				.get()
				.cloud.balena.models.application.remove(
					this.context.get().balena.application,
				);
		});

		// Push a single container application 
		this.log(`Cloning getting started repo...`)
		await exec(`git clone https://github.com/balena-io-examples/balena-node-hello-world.git ${__dirname}/app`)

		this.log(`Pushing release to app...`)
		await exec(`balena push ${this.context.get().balena.application} --source ${__dirname}/app`)

		await this.context
			.get()
			.cloud.balena.models.key.create(
				this.context.get().balena.sshKey.label,
				await this.context
					.get()
					.utils.createSSHKey(this.context.get().sshKeyPath),
			);
		this.suite.teardown.register(() => {
			return Bluebird.resolve(
				this.context
					.get()
					.cloud.removeSSHKey(this.context.get().balena.sshKey.label),
			)
		});

		// generate a uuid
		this.suite.context.set({
			balena: {
				uuid: this.context.get().cloud.balena.models.device.generateUniqueKey(),
			},
		});

		this.suite.context.set({
			os: new BalenaOS(
				{
					deviceType: this.suite.deviceType.slug,
					network: this.suite.options.balenaOS.network,
				},
				this.getLogger(),
			),
		});		

		// unpack OS
		await this.context.get().os.fetch({
			type: this.suite.options.balenaOS.download.type,
			version: this.suite.options.balenaOS.download.version,
		});

		// get config.json for application
		let config = await this.context.get().cloud.balena.models.os.getConfig(
			this.context.get().balena.application, 
			{ version:  this.context.get().os.contract.version }
		)
		
		config.uuid = this.context.get().balena.uuid

		//register the device with the application
		let deviceApiKey = await this.context.get().cloud.balena.models.device.register(this.context.get().balena.application, this.context.get().balena.uuid)
		config.deviceApiKey = deviceApiKey.api_key

		// get newly registered device id
		await Bluebird.delay(1000 * 10)
		let devId = await this.context.get().cloud.balena.models.device.get(this.context.get().balena.uuid)
		config.deviceId = devId.id

		// get ready to populate image config.json
		this.context
			.get()
			.os.addCloudConfig(config);

		this.suite.teardown.register(() => {
			this.log('Worker teardown');
			return this.context.get().worker.teardown();
		});
		this.log('Setting up worker');
		await this.context
			.get()
			.worker.network(this.suite.options.balenaOS.network);
		await this.context.get().os.configure();
		await this.context.get().worker.off();
		await this.context.get().worker.flash(this.context.get().os.image.path);
		await this.context.get().worker.on();

		// Checking if device is reachable - this should be a helper ( it will be different for managed and unmanaged )
		this.log('Waiting for device to be reachable');
		await this.context.get().utils.waitUntil(() => {
			return this.context
				.get()
				.cloud.balena.models.device.isOnline(this.context.get().balena.uuid);
		});

		assert.equal(
			await this.context
				.get()
				.cloud.executeCommandInHostOS(
					'cat /etc/hostname',
					this.context.get().balena.uuid,
				),
			this.context.get().balena.uuid.slice(0, 7),
			'Device should be reachable',
		);
	},
	tests: [
	//	'./tests/preload',
	'./tests/supervisor',
	//	'./tests/register',
	//	'./tests/download-strategies',
	//	'./tests/move',
	//	'./tests/variables',
	//	'./tests/supervisor-api',
	//	'./tests/hostapp',
	],
};
