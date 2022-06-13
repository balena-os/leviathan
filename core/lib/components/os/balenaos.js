/**
 * # balenaOS helpers
 *
 * The `BalenaOS` helper class can be used to configure and unpack the OS image that you will use in the test. This allows you to inject config options and network credentials into your image.
 *
 * ```js
 * const network_conf = {
 *    ssid: SSID,
 *    psk: PASSWORD,
 *    nat: true,
 * }
 *
 * const os = new BalenaOS(
 *   {
 *      deviceType: DEVICE_TYPE_SLUG,
 *      network: network_conf,
 *      configJson: {
 *          uuid: UUID,
 *          persistentLogging: true
 *      }
 *   },
 *   this.getLogger()
 * );
 * await os.fetch()
 * await os.configure()
 * ```
 *
 * Alternatively, you can use the CLI to perform these functions - the CLI is imported in the testing environment:
 *
 * ```js
 * await exec(`balena login --token ${API_KEY}`)
 * await exec(`balena os configure ${PATH_TO_IMAGE} --config-network wifi --config-wifi-key ${PASSWORD}
 * --config-wifi-ssid ${SSID}`);
 * ```
 *
 * @module balenaOS helpers
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

const assignIn = require('lodash/assignIn');
const mapValues = require('lodash/mapValues');

const Bluebird = require('bluebird');
const config = require('config');
const imagefs = require('balena-image-fs');
const { fs } = require('mz');
const { join } = require('path');
const tmp = require('tmp');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const zlib = require('zlib');
const util = require('util');

// TODO: This function should be implemented using Reconfix
const injectBalenaConfiguration = async (image, configuration, partition = 1) => {
	await imagefs.interact(image, partition, async (_fs) => {
		return util.promisify(_fs.writeFile)(
				'/config.json',
				JSON.stringify(configuration),
				{ flag: 'w' }
			)
		}).catch((err) => {
				return undefined;
		});
};

// TODO: This function should be implemented using Reconfix
const injectNetworkConfiguration = async (image, configuration, partition = 1) => {
	if (configuration.wireless == null) {
		return;
	}
	if (configuration.wireless.ssid == null) {
		throw new Error(
			`Invalid wireless configuration: ${configuration.wireless}`,
		);
	}

	const wifiConfiguration = [
		'[connection]',
		'id=balena-wifi',
		`${configuration.wireless.interfaceName}`,
		'type=wifi',
		'[wifi]',
		'hidden=true',
		'mode=infrastructure',
		`ssid=${configuration.wireless.ssid}`,
		'[ipv4]',
		'method=auto',
		'[ipv6]',
		'addr-gen-mode=stable-privacy',
		'method=auto',
	];

	if (configuration.wireless.psk) {
		Reflect.apply(wifiConfiguration.push, wifiConfiguration, [
			'[wifi-security]',
			'auth-alg=open',
			'key-mgmt=wpa-psk',
			`psk=${configuration.wireless.psk}`,
		]);
	}

	await imagefs.interact(image, partition, async (_fs) => {
		return util.promisify(_fs.writeFile)(
				'/system-connections/balena-wifi',
				wifiConfiguration.join('\n'),
				{ flag: 'w' }
			)
		}).catch((err) => {
			return undefined;
	});
};

async function isGzip(filePath) {
	const buf = Buffer.alloc(3);
	await fs.read(await fs.open(filePath, 'r'), buf, 0, 3, 0);
	return buf[0] === 0x1f && buf[1] === 0x8b && buf[2] === 0x08;
}

function id() {
	return `${Math.random().toString(36).substring(2, 10)}`;
}

module.exports = class BalenaOS {
	constructor(
		options = {},
		logger = { log: console.log, status: console.log, info: console.log },
	) {
		this.bootPartition = 1;
		this.deviceType = options.deviceType;
		this.network = options.network;
		this.image = {
			input:
				options.image === undefined
					? config.get('leviathan.uploads').image
					: options.image,
			path: join(config.get('leviathan.downloads'), `image-${id()}`),
		};
		this.configJson = options.configJson || {};
		this.contract = {
			network: mapValues(this.network, (value) => {
				return typeof value === 'boolean' ? value : true;
			}),
		};

		switch (this.deviceType) {
			case 'jetson-nano':
				this.bootPartition = 12;
				break;
			case 'rockpi-4b-rk3399':
				this.bootPartition = 4;
				break;
			case '243390-rpi3':
				this.network.wireless.interfaceName = 'interface-name=wlan0';
			default:
				this.bootPartition = 1;
		}
		this.logger = logger;
		this.releaseInfo = { version: null, variant: null };
	}

	/**
	 * Prepares the received image/artifact to be used - either unzipping it or moving it to the Leviathan working directory
	 *
	 * @remark Leviathan creates a temporary working directory that can referenced using `config.get('leviathan.downloads')`
	 *
	 * @category helper
	 */
	async fetch() {
		this.logger.log(`Unpacking the file: ${this.image.input}`);
		const unpack = await isGzip(this.image.input);
		if (unpack) {
			await pipeline(
				fs.createReadStream(this.image.input),
				zlib.createGunzip(),
				fs.createWriteStream(this.image.path),
			);
		} else {
			// image is already unzipped, so no need to do anything
			this.image.path = this.image.input;
		}
	}


	/**
	 * Parses version and variant from balenaOS images
	 * @param {string} image
	 *
	 * @category helper
	 */
	async readOsRelease(image = this.image.path) {
		const readVersion = async (pattern, field) => {
			this.logger.log(`Checking ${field} in os-release`);
			try {
				let value = await imagefs.interact(image, this.bootPartition, async (_fs) => {
					return await util.promisify(_fs.readFile)('/os-release')
						.catch((err) => {
							return undefined;
						});
				});
				value = pattern.exec(value.toString());

				if (value !== null) {
					this.releaseInfo[field] = value[1];
					this.logger.log(
						`Found ${field} in os-release file: ${this.releaseInfo[field]}`,
					);
				}
			} catch (e) {
				try {
					let value1 = await imagefs.interact(image, this.bootPartition + 1, async (_fs) => {
						return await util.promisify(_fs.readFile)('/usr/lib/os-release')
							.catch((err) => {
								return undefined;
							});
					});
					value1 = pattern.exec(value1.toString());
					if (value1 !== null) {
						this.releaseInfo[field] = value1[1];
						this.logger.log(
							`Found ${field} in os-release file (flasher image): ${this.releaseInfo[field]}`,
						);
					}
				} catch (err) {
					this.logger.log(`Couldn't find os-release file`);
				}
			}
		};

		await readVersion(/VERSION="(.*)"/g, 'version');
		await readVersion(/VARIANT="(.*)"/g, 'variant');
		assignIn(this.contract, {
			version: this.releaseInfo.version,
			variant: this.releaseInfo.variant,
		});
	}

	addCloudConfig(configJson) {
		assignIn(this.configJson, configJson);
	}

	/**
	 * Configures balenaOS image with specifc configuration (if provided), and injects required network configuration
	 *
	 * @category helper
	 */
	async configure() {
		await this.readOsRelease();
		this.logger.log(`Configuring balenaOS image: ${this.image.input}`);
		if (this.configJson) {
			await injectBalenaConfiguration(this.image.path, this.configJson, this.bootPartition);
		}
		await injectNetworkConfiguration(this.image.path, this.network, this.bootPartition);
	}
}

