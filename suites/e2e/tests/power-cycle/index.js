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

module.exports = {
	title: 'Power Cycle Tests',
	tests: [
		{
			title: 'Power cycling the DUT',
			workerContract: {
				type: 'object',
				required: ['workerType'],
				properties: {
					workerType: {
						type: 'string',
						const: 'testbot_hat'
					},
				},
			},
			run: async function (test) {
				await this.worker.on();
				await delay(4 * 1000); // Wait 4s before measuring Vout.
				const maxDeviation = 0.15; // 8%
				// Poll worker diagnostics only after the device has fully powered on.
				const testbot = await this.worker.diagnostics();

				test.true(
					testbot.vout >= testbot.deviceVoltage * maxDeviation,
					`Output voltage (${testbot.vout}) should be >= expected minimum voltage (${testbot.deviceVoltage * maxDeviation})`,
				);

				test.true(
					testbot.vout < testbot.deviceVoltage * (1 + maxDeviation),
					`Output Voltage ${testbot.vout} should be < expected maximum voltage (${testbot.deviceVoltage * (1 + maxDeviation)})`,
				);

				// The lowest power device we currently have drew 0.03A when tested
				test.true(
					testbot.amperage > 0.03,
					`Output current ${testbot.amperage} should be above the 0.03 limit`,
				);

				await this.worker.off();
				test.true(true, 'Device should be able to power cycle properly.');
			},
		},
		{
			title: 'Is the DUT reachable?',
			run: async function (test) {

				await this.worker.addSSHKey(this.sshKeyPath);

				// create tunnels
				this.log('Creating SSH tunnels to DUT');
				await this.worker.createSSHTunnels(
					this.link,
				);

				await this.worker.on();
				this.log('Waiting for device to be reachable');
				test.equal(
					await this.context
						.get()
						.worker.executeCommandInHostOS(
							'cat /etc/hostname',
							this.link,
						),
					this.link.split('.')[0],
					'Device should be reachable',
				);
				await this.worker.off();
			}
		}
	],
};
