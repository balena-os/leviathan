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
const Bluebird = require('bluebird');
const exec = Bluebird.promisify(require('child_process').exec);

module.exports = {
	title: "Flashing tests",
	tests: [
		{
			title: "Flashing an image",
			run: async function (test) {
				try {
					await this.worker.off(); // Ensure DUT is off before starting tests
					await exec('dd if=/dev/urandom of=temp_1GB_file bs=1g count=1')
					console.log(`file created ${await exec(`du -h temp_1GB_file`)}`)
					await this.worker.flash('temp_1GB_file');
				} catch (err) {
					throw new Error(`Flashing failed with error: ${err}`);
				}
				test.true(true, `${this.os.image.path} should be flashed properly`);
			},
		},
	],
};
