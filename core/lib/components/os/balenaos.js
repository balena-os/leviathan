/**
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
const config = require('../../config');
const imagefs = require('balena-image-fs');
const { fs } = require('mz');
const { join } = require('path');
const tmp = require('tmp');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const zlib = require('zlib');
const util = require('util');

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
					? config.leviathan.uploads.image
					: options.image,
			path: join(config.leviathan.downloads, `image-${id()}`),
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
	 *
	 * @category helper
	 */
	async fetch() {
		// Code to trigger download of the image on the worker

	}


	/**
	 *
	 * @category helper
	 */
	async configure() {
		//  Code to trigger configuration of the image on the worker

	}
}

