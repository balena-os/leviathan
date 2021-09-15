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

const { Bluebird } = require('Bluebird');

module.exports = {
	title: 'Testbot Power Test',
	tests: [
		{
			title: 'Power cycling the DUT',
			run: async function(test) {
				await this.context.get().worker.on();
				await Bluebird.delay(4 * 1000); // Wait 4s before measuring Vout.
				const maxDeviation = 0.15; // 8%
				const testbot = await this.context.get().worker.readOutput();

				const outVoltage = testbot.vout;

				if (outVoltage >= testbot.deviceVoltage * maxDeviation) {
					test.true('Output Voltage is above expected under max deviation');
				}

				if (outVoltage < testbot.deviceVoltage * (1 + maxDeviation)) {
					test.true(
						"Output Voltage isn't that high either under max deviation. Chill the DUT is fine.",
					);
				}

				const outCurrent = testbot.amperage;
				// The lowest power device we currently have drew 0.03A when tested
				if (outCurrent > 0.03) {
					test.true('Output current is above 0.03. Ready for take off.');
				}

				this.log('Waiting for device to be reachable');
				test.is(
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
				test.true(
					'Device is able to power-cycle. Just put it to bed. Next test.',
				);
			},
		},
	],
};
