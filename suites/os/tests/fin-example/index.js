/* Copyright 2019 balena
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

const { exec } = require('mz/child_process');
const { delay } = require('bluebird');
const retry = require('bluebird-retry');
const { child_process } = require('mz');
const rp = require('request-promise');

module.exports = {
	title: 'Fin tests',
	deviceType: {
		type: 'object',
        required: ['slug'],
		properties:
        {
          slug: {
            type: 'string',
            const: 'fincm3'
          }
	    }
	},
	tests: [
        {
			title: 'IO expander detection test',
			run: async function(test) {
				let error = null;
				try {
					await this.context
						.get()
						.worker.executeCommandInHostOS(
							'cat /sys/devices/platform/i2c*/i2c-*/*-0020/gpio/*/base',
							this.context.get().link,
						);
				} catch (e) {
					error = e; // if the command returns an error (i.e the file doesn't exist), we set error to a non-null value
				}
				test.is(error, null, "Should be able to find base address of IO expander"); // if error === null, the test passes
			},
		},
		{
			title: 'RTC test',
			run: async function(test) {
				let result = "";
				result = await this.context
					.get()
					.worker.executeCommandInHostOS(
						'dmesg | grep rtc0',
						this.context.get().link,
					); 
				
				const check = result.includes("registered as rtc0");
				test.is(check, true, "Should see that rtc driver registered");
			},
		},
	]
};