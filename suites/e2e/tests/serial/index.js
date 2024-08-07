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

"use strict";

const { delay } = require("bluebird");
const fs = require("fs").promises;
const SERIAL_PATH = "/reports/dut-serial.txt";

module.exports = {
	title: "Serial test",
	tests: [
		{
			title: "Recording DUT serial output",
			workerContract: {
				type: "object",
				required: ["workerType"],
				properties: {
					workerType: {
						type: "string",
						const: "testbot_hat",
					},
				},
			},
			run: async function (test) {
				await delay(60 * 1000);
				await this.context.get().worker.off();

				try {
					await fs.access(SERIAL_PATH);
					console.log(`Serial file found at ${SERIAL_PATH}`);
				} catch (err) {
					console.log(`${err}`);
					if (this.workerContract.workerType === `testbot_hat`) {
						try {
							await fs.writeFile(SERIAL_PATH, (await this.worker.fetchSerial()).toString(), { encoding: "utf8" });
							console.log(`Serial file created at ${SERIAL_PATH}`);
						} catch (error) {
							console.err(`Couldn't find logs: ${error}`);
						}
					}
				} finally {
					if ((await fs.stat(SERIAL_PATH)).size === 0) {
						console.log(`Size of serial output file from DUT shouldn't be 0. Check if serial is connected if this is unexpected?`)
					}

					if ((await fs.readFile(`${SERIAL_PATH}`, "utf8")).trim().split("  ").length === 0) {
						console.log(`Serial output from DUT shouldn't be empty. Check if serial is connected if this is unexpected?`)
					}
				}
			},
		},
	],
};
