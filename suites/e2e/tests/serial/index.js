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
const util = require('util');
const exec = util.promisify(require('child_process').exec);

module.exports = {
	title: 'Serial Test',
	tests: [
		{
			title: 'Recording DUT serial output',
			run: async function(test) {
				await this.context.get().worker.on();
				await delay(20 * 1000);
				await exec(
					'head -n 20 /reports/dut-serial.txt',
					(error, stdout, stderr) => {
						if (error || stderr || stdout === '') {
							throw new Error(
								`Error with DUT serial output: ${error + stderr + stdout}`,
							);
						}
						// console.log(stdout)
						test.true(
							stdout,
							'Should be able to record serial output from DUT.',
						);
						console.log(done);
					},
				);
			},
		},
	],
};
