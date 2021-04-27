/* Copyright 2019 balena
 *
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
const { exec } = require('mz/child_process');
const Bluebird = require('bluebird');

module.exports = {
	title: 'Multicontainer app tests',
	run: async function(test) {
		const moveApplicationName = `${this.context.get().balena.application}_MoveDevice`;

		// create new application
		await this.context
			.get()
			.cloud.balena.models.application.create({
				name: moveApplicationName,
				deviceType: this.context.get().os.deviceType,
				organization: 'gh_rcooke_warwick',
			})
		
		this.context.set({
			moveApp: moveApplicationName
		})

		this.suite.context.set({
			moveApp: moveApplicationName
		})

		// Remove this app at the end of the test suite
		this.suite.teardown.register(() => {
			this.log(`Removing application ${moveApplicationName}`);
			return this.context
				.get()
				.cloud.balena.models.application.remove(
					moveApplicationName,
				);
		});

		// push multicontainer app release to new app
		test.comment(`Cloning repo...`)
		await exec(`git clone https://github.com/balena-io-examples/multicontainer-getting-started.git ${__dirname}/app`)

		test.comment(`Pushing release...`)
		await exec(`balena push ${moveApplicationName} --source ${__dirname}/app`)
	},
	tests: [
		{
			title: 'Move device to multicontainer App',
			run: async function(test){
				// move device to new app
				await this.context.get().cloud.balena.models.device.move(
					this.context.get().balena.uuid,
					this.context.get().moveApp
				)

				let current_services = {}
				// wait until the device is running all services 
				await this.context.get().utils.waitUntil(async () => {
					test.comment("Checking if expected services are all running...")
					let services = await this.context.get().cloud.balena.models.device.getWithServiceDetails(this.context.get().balena.uuid)
					current_services = {
						frontend: services.current_services.frontend[0],
						proxy: services.current_services.proxy[0],
						data: services.current_services.data[0]
					}
					return (
						(current_services.frontend.status === "Running") &&
						(current_services.proxy.status === "Running") &&
						(current_services.proxy.status === "Running")
					)
				},false);
				test.ok(true, "All services running")
			}
		},
		{
			title: 'Set device environment variables',
			run: async function(test){
				let key = "deviceVar"
                let value = "value"

				// set device variable
                await this.context.get().cloud.balena.models.device.envVar.set(
                    this.context.get().balena.uuid, 
                    key, 
                    value
                );
                
				// containers will restart now, which will change their id - so we fetch the container names
                let containers = await this.context.get().cloud.executeCommandInHostOS(
					`balena ps --format "{{.Names}}"`,
					this.context.get().balena.uuid	
				);

                // convert into array of container ids
                let containerIds = containers.split("\n");
				//remove supervisor container from array
				containerIds.splice(containerIds.indexOf(`resin_supervisor`))
				console.log(containerIds)

				// check to see if variables are visible in each container
                await this.context.get().utils.waitUntil(async () => {
                    test.comment("Checking to see if variables are visible...");
                    let pass = false

					if(containerIds.length === 3){
						pass = true
					}
                    for(let element of containerIds) {
                        let env = await this.context.get().cloud.executeCommandInHostOS(`balena exec ${element} env`,this.context.get().balena.uuid)
                        // if the env for any container doesn't yet show our new env variable, set pass to false so we retry
                        if(!(env.includes(`${key}=${value}\n`)) || (env === "")){ 
							pass = false
                        }
                    };
                    return (pass === true)
                });
                test.ok(true, `Should see device env variable`)
			}
		},
		{
			title: 'Set service environment variables',
			run: async function(test){
				let key = "serviceVar"
                let value = "value"

				let services = await this.context.get().cloud.balena.models.device.getWithServiceDetails(this.context.get().balena.uuid)
				
				// set device variable
                await this.context.get().cloud.balena.models.device.serviceVar.set(
                    this.context.get().balena.uuid, 
					services.current_services.frontend[0].service_id,
                    key, 
                    value
                );

				// Check to see if variable is present in front end service, and not in others (also that other services haven't restarted)
				await this.context.get().utils.waitUntil(async () => {
					test.comment("Checking to see if variables are visible...");
					let containerId = await this.context.get().cloud.executeCommandInHostOS(
						`balena ps --format "{{.Names}}" | grep frontend`,
						this.context.get().balena.uuid
					)
					let env = await this.context.get().cloud.executeCommandInHostOS(`balena exec ${containerId} env`,this.context.get().balena.uuid)
					return env.includes(`${key}=${value}\n`)
				}, false);

				test.ok(true, `Should service env var in service it was set for`)
			}
		},
		{
			title: 'Move device back to original app',
			run: async function(test){
				// move device to new app
				await this.context.get().cloud.balena.models.device.move(
					this.context.get().balena.uuid,
					this.context.get().balena.application
				)

				// check we are running the original releases container - we should maybe create a helper for this...
				await this.context.get().utils.waitUntil(async () => {
					test.comment("Checking if expected services are all running...")
					let services = await this.context.get().cloud.balena.models.device.getWithServiceDetails(this.context.get().balena.uuid)
					return (services.current_services.main[0].status === "Running")
					
				},false);

				test.ok(true, `Device should have been moved back to original app, and be running its service`)
			}
		}
	]
};
