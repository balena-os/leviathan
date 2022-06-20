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
const SERIAL_PATH = "/reports/dut-serial.txt"

module.exports = {
	title: 'Serial test',
	tests: [
		{
			title: 'Recording DUT serial output',
			run: async function (test) {
				await this.context.get().worker.on();
				await delay(20 * 1000);
				await this.context.get().worker.off();

				try {
					await fs.access(SERIAL_PATH, fs.constants.F_OK)
					test.comment(`Serial file found at ${SERIAL_PATH}`)
				} catch (err) {
					test.comment(await this.context
						.get()
						.worker.executeCommandInWorker(`cat ${SERIAL_PATH}`))
					if (this.workerContract.workerType === `testbot_hat`) {
						await fs.writeFile(
							`${SERIAL_PATH}`,
							(await this.context
								.get()
								.worker.executeCommandInWorker(`cat ${SERIAL_PATH}`)).toString(),
							{ encoding: 'utf8' }
						)
						test.comment(`Serial file created at ${SERIAL_PATH}`)
					}
				} finally {
					test.not(
						(await fs.stat(`${SERIAL_PATH}`)).size,
						0,
						`Size of serial output file from DUT shouldn't be 0`,
					)
					test.not(
						(((await fs.readFile(`${SERIAL_PATH}`, 'utf8')).trim()).split('  ')).length,
						0,
						`Serial output from DUT shouldn't be empty`,
					)
				}
			}
		},
	],
};
