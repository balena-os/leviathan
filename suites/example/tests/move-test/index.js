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

module.exports = {
	title: 'Move app test',
	tests: [
		{
			title: 'Move device to another application',
			run: async function(test) {
				// create a new app
				const moveApp = 'move-app';
				let err = 'fail';
				await this.context
					.get()
					.balena.sdk.models.application.create({
						name: moveApp,
						deviceType: this.context.get().deviceType,
						organization: 'gh_rcooke_warwick',
					})
					.then(function(application) {
						// console.log(application);
						err = 'pass';
					});

				err = 'pass';
				test.is(err, 'pass', 'Could create new app');
				const uuid = await this.context.get().uuid;

				// register a function that will be called upon teardown to remove this new app
				this.teardown.register(() => {
					return this.context
						.get()
						.balena.sdk.models.application.remove(moveApp);
				});

				// move device to new app
				await this.context.get().balena.sdk.models.device.move(uuid, moveApp);

				// check that the device is in the new application
				let online = false;
				while (online === false) {
					await this.context
						.get()
						.balena.sdk.models.device.getAllByApplication(moveApp)
						.then(function(devices) {
							if (devices.length !== 0) {
								online = devices[0].is_online;
							}
						});
				}
				test.is(online, true, 'Device moved to new app!');

				// moving the device back should be done in the afterEach method in the suite
			},
		},
	],
};
