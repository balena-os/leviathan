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

module.exports = {
	title: 'BalenaOS release suite',
	run: async function() {
		const Worker = this.require('common/worker');
		const BalenaOS = this.require('components/os/balenaos');
		const Balena = this.require('components/balena/sdk');
		const CLI = this.require('components/balena/cli');
		const DeviceApplication = this.require('components/balena/utils');

		await fse.ensureDir(this.suite.options.tmpdir);

		this.suite.context.set({
			balena: {
				application: { name: this.suite.options.id },
				deviceApplicationChain: new DeviceApplication().getChain(),
				sdk: new Balena(this.suite.options.balena.apiUrl),
				sshKey: { label: this.suite.options.id },
			},
			sshKeyPath: join(homedir(), 'id'),
			utils: this.require('common/utils'),
			worker: new Worker(
				this.suite.deviceType.slug,
				this.suite.options.worker.url,
			),
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
			}),
		});

		await this.context
			.get()
			.balena.sdk.loginWithToken(this.suite.options.balena.apiKey);
		this.teardown.register(() => {
			return this.context
				.get()
				.balena.sdk.logout()
				.catch(
					{
						code: 'BalenaNotLoggedIn',
					},
					noop,
				);
		});

		await this.context
			.get()
			.balena.sdk.createApplication(
				this.context.get().balena.application.name,
				this.suite.deviceType.slug,
				{
					delta: this.suite.options.balena.application.env.delta,
				},
			);
		this.suite.teardown.register(() => {
			return this.context
				.get()
				.balena.sdk.removeApplication(
					this.context.get().balena.application.name,
				)
				.catch(
					{
						code: 'BalenaNotLoggedIn',
					},
					noop,
				)
				.catch(
					{
						code: 'BalenaApplicationNotFound',
					},
					noop,
				);
		});

		await this.context
			.get()
			.balena.sdk.addSSHKey(
				this.context.get().balena.sshKey.label,
				await this.context
					.get()
					.utils.createSSHKey(this.context.get().sshKeyPath),
			);
		this.suite.teardown.register(() => {
			return Bluebird.resolve(
				this.context
					.get()
					.balena.sdk.removeSSHKey(this.context.get().balena.sshKey.label),
			).catch(
				{
					code: 'BalenaNotLoggedIn',
				},
				noop,
			);
		});

		await this.context
			.get()
			.balena.sdk.disableAutomaticUpdates(
				this.context.get().balena.application.name,
			);
		// Device Provision with preloaded application
		const promiseDownload = this.context
			.get()
			.balena.deviceApplicationChain.init({
				url: 'https://github.com/balena-io-projects/balena-cpp-hello-world.git',
				sdk: this.context.get().balena.sdk,
				path: this.suite.options.tmpdir,
			})
			.then(chain => {
				return chain.clone();
			})
			.then(async chain => {
				return chain.push(
					{
						name: 'master',
					},
					{
						name: 'balena',
						url: await this.context
							.get()
							.balena.sdk.getApplicationGitRemote(
								this.context.get().balena.application.name,
							),
					},
				);
			})
			.then(chain => {
				this.suite.context.set({ preload: { hash: chain.getPushedCommit() } });
				return chain.emptyCommit();
			})
			.then(chain => {
				return chain.push({ name: 'master' });
			});

		await this.context.get().os.fetch({
			type: this.suite.options.balenaOS.download.type,
			version: this.suite.options.balenaOS.download.version,
		});
		await promiseDownload;
		await new CLI().preload(this.context.get().os.image.path, {
			app: this.context.get().balena.application.name,
			commit: this.context.get().preload.hash,
			pin: true,
		});

		this.suite.context.set({
			balena: {
				uuid: await this.context.get().balena.sdk.generateUUID(),
			},
		});
		this.context
			.get()
			.os.addCloudConfig(
				await this.context
					.get()
					.balena.sdk.getDeviceOSConfiguration(
						this.context.get().balena.uuid,
						await this.context
							.get()
							.balena.sdk.register(
								this.context.get().balena.application.name,
								this.context.get().balena.uuid,
							),
						this.context.get().os.contract.version,
					),
			);

		this.teardown.register(() => {
			this.log('Worker teardown');
			return this.context.get().worker.teardown();
		});
		this.log('Setting up worker');
		await this.context.get().worker.select({
			type: this.suite.options.worker.type,
			options: {
				network: {
					wireless: 'wlan0',
				},
			},
		});
		await this.context
			.get()
			.worker.network(this.suite.options.balenaOS.network);
		await this.context.get().worker.flash(this.context.get().os);
		await this.context.get().worker.on();

		// Checking if device is reachable
		this.log('Waiting for device to be reachable');
		await this.context.get().utils.waitUntil(() => {
			return this.context
				.get()
				.balena.sdk.isDeviceOnline(this.context.get().balena.uuid);
		});
		assert.equal(
			await this.context
				.get()
				.balena.sdk.executeCommandInHostOS(
					'cat /etc/hostname',
					this.context.balena.uuid,
				),
			this.context.get().balena.uuid.slice(0, 7),
			'Device should be reachable',
		);
	},
	tests: [
		'./tests/preload',
		'./tests/register',
		'./tests/download-strategies',
		'./tests/move',
		'./tests/supervisor-api',
		'./tests/hostapp',
	],
};
