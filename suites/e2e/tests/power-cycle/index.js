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
	title: 'Testbot Power Test',
	tests: [
		{
			title: 'Power cycling the DUT',
			run: async function(test) {
			if (await this.context.get().worker.diagnostics().worker === 'testbot') {
				await this.context.get().worker.on();
				await delay(4 * 1000); // Wait 4s before measuring Vout.
				const maxDeviation = 0.15; // 8%
				const testbot = await this.context.get().worker.diagnostics();
				test.true(
					testbot.vout >= testbot.deviceVoltage * maxDeviation,
					'Output voltage should be more than the expected minimum voltage',
				);

				test.true(
					testbot.vout < testbot.deviceVoltage * (1 + maxDeviation),
					'Output Voltage should be less than the expected maximum voltage.',
				);

				// The lowest power device we currently have drew 0.03A when tested
				test.true(
					testbot.amperage > 0.03,
					'Output current should be above the 0.03 limit',
				);

				this.log('Waiting for device to be reachable');
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

				await this.context.get().worker.off();
				test.true(true, 'Device should be able to power cycle properly.');
				} 
						else if (await this.context.get().worker.diagnostics().worker === 'qemu') {
							await this.context.get().worker.on();
							this.log('Waiting for device to be reachable');
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
							await this.context.get().worker.off();
				test.true(true, 'Device should be able to power cycle properly.');
						}
			},
		},
	],
};
