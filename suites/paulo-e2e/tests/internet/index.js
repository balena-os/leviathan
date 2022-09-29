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
const config = {
  timeout: 5000, //timeout connecting to each server, each try
  retries: 5,//number of retries to do before failing
  domain: 'https://google.com',//the domain to check DNS record of
}

const checkInternetConnected = require('check-internet-connected');

module.exports = {
	title: 'Internet connectivity tests',
	tests: [
		{
			title: 'Check test connectivity',
			run: async function (test) {
				try {
          await this.worker.on(); // Ensure DUT is onn before starting tests

          return checkInternetConnected(config)
            .then((result) => {
              test.true(true, "There's internet");
            })
            .catch((ex) => {
              test.true(false, "There's no internet");
            });
				} catch (err) {
					throw new Error(`Check test connectivity failed with error: ${err}`);
				}
			},
		},
	],
};
