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

const fs = require('fs').promises;

module.exports = {
	title: 'Serial test',
	tests: [
		{
			title: 'Recording DUT serial output',
			run: async function (test) {
				await this.context.get().worker.on();
				test.equal(
					await this.context
						.get()
						.worker.executeCommandInHostOS(
							'cat /etc/hostname',
							this.context.get().link,
						),
					this.context.get().link.split('.')[0],
					'Device should be reachable',
				);
				test.not(
					(await fs.stat('/reports/dut-serial.txt')).size,
					0,
					`Should be able to retrieve serial output from DUT`,
				);
			}
		},
	],
};
