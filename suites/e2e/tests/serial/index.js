/*
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

const { delay } = require('bluebird');
const fs = require('fs').promises;

module.exports = {
	title: 'Worker Serial Test',
	tests: [
		{
			title: 'Recording DUT serial output',
			run: async function (test) {
				await this.context.get().worker.on();
				await delay(10 * 1000);

				// TODO: Finish QEMU serial recording feature in order to test QEMU worker's serial output capablities as well.
				if ((await this.context.get().worker.diagnostics()).worker === 'testbot') {
					test.not(
						(await fs.stat('/reports/dut-serial.txt')).size,
						0,
						`Should be able to retrieve serial output from DUT`,
					);
				}
			},
		},
	],
};
