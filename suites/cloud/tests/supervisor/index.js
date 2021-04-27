`use strict`
const { exec } = require('mz/child_process');
const Bluebird = require('bluebird');

module.exports = {
	title: 'Supervisor test suite',
    tests: [
        {
            title: 'Provisioning without deltas',
            run: async function(test) {    
                // should see deltas being disabled in logs
                
                // push an app
                // push multicontainer app release to new app
                test.comment(`Cloning repo...`)
                await exec(`git clone https://github.com/balena-io-examples/balena-python-hello-world.git ${__dirname}/app`)

                test.comment(`Pushing release...`)
                await exec(`balena push ${this.context.get().balena.application} --source ${__dirname}/app`)
                
                // get application commit latest
                //check new commit of app 
                let firstCommit = await this.context.get().cloud.balena.models.application.get(
                    this.context.get().balena.application
                    )
                    .get('commit')

                
                test.comment(`Application commit is ${firstCommit}`);

                // wait untul we have the application downloaded
                await this.context.get().utils.waitUntil(async () => {
					test.comment("Checking if expected services are all running...")
					let services = await this.context.get().cloud.balena.models.device.getWithServiceDetails(this.context.get().balena.uuid)
					console.log("services are: ")
                    console.log(services.current_services.main[0])
                    return (services.current_services.main[0].status === "Running")
					
				},false);

                await this.context.get().utils.waitUntil(async () => {
                    test.comment("Checking device commit...")
                    let deviceCommit = await this.context.get().cloud.balena.models.device.get(
                        this.context.get().balena.uuid
                        )
                        .get('is_on__commit')

                    test.comment(`Device commit is ${deviceCommit}`);
                    return deviceCommit === firstCommit
                },false);

                test.comment(`Disabling deltas`)
                await this.context.get().cloud.balena.models.device.configVar.set(
                    this.context.get().balena.uuid,
                    'RESIN_SUPERVISOR_DELTA', 
                    0
                );


                // add a comment to the end of the main.py file, to trigger a delta
                await exec(`echo "#comment" >> ${__dirname}/app/src/main.py`)
                test.comment(`Pushing release...`)
                await exec(`balena push ${this.context.get().balena.application} --source ${__dirname}/app`)
                await this.context.get().utils.waitUntil(async () => {
                    let secondCommit = await this.context.get().cloud.balena.models.application.get(
                        this.context.get().balena.application
                        )
                        .get('commit')
    
                    
                    test.comment(`Application commit is ${secondCommit}`);
                    return secondCommit !== firstCommit
                },false);
                

                //check device is now on new commit
                await this.context.get().utils.waitUntil(async () => {
                    test.comment("Checking device commit...")
                    let deviceCommit = await this.context.get().cloud.balena.models.device.get(
                        this.context.get().balena.uuid
                        )
                        .get('is_on__commit')

                    test.comment(`Device commit is ${deviceCommit}`);
                    return deviceCommit === secondCommit
                },false);
            
                
                // wait until we have the application downloaded - how~~~~~
                await this.context.get().utils.waitUntil(async () => {
					test.comment("Checking if expected services are all running...")
					let services = await this.context.get().cloud.balena.models.device.getWithServiceDetails(this.context.get().balena.uuid)
                    return (services.current_services.main[0].status === "Running")
					
				},false);


                // device should download application without mentioning that deltas are being used
                let logs = await this.context.get().cloud.balena.logs.history(
                    this.context.get().balena.uuid
                )   
                console.log(logs)
                
            },
        },
        {
            title: 'Supervisor reload test',
            run: async function(test) {
                // check with balena images if supervisor in device is correct
                // balena images --format "{{.Repository}} {{.Tag}}" | grep supervisor
                let supervisor = await this.context.get().cloud.executeCommandInHostOS(
                    `balena images --format "{{.Repository}} {{.Tag}}" | grep supervisor`,
                    this.context.get().balena.uuid
                )
                
                let supervisorVersion = supervisor.split(' v')[1]
                test.comment(`Supervisor versinon ${supervisorVersion} detected`)
            
                // remove supervisor container
                // systemctl stop resin-supervisor && balena rm resin_supervisor && balena rmi -f $(balena images | grep supervisor | awk '{print $3}')
                test.comment(`removing supervisor`)
                await this.context.get().cloud.executeCommandInHostOS(
                    `systemctl stop resin-supervisor && balena rm resin_supervisor && balena rmi -f $(balena images | grep supervisor | awk '{print $3}')`,
                    this.context.get().balena.uuid
                )

                // push an update to the application
                test.comment(`Pushing release...`)
                await exec(`balena push ${this.context.get().balena.application} --source ${__dirname}/../../app`)

                // need to check we aren't downloading ?

                // run supervisor update script
                // update-resin-supervisor
                test.comment(`running update supervisor script...`)
                await this.context.get().cloud.executeCommandInHostOS(
                    `update-resin-supervisor`,
                    this.context.get().balena.uuid
                )
                
                
                //* balena images shows the same version of supervisor the device has started with
                let updatedsupervisorVersion = ""
                
                // problem with this section of the test - 
                
                // once the supervisor has been re-downloaded, its not tagged/called resin-supervisor any more, so we need a different way to get it
                await this.context.get().utils.waitUntil(async () => {
					test.comment(`checking supervisor has been re-downloaded...`)
                    updatedsupervisorVersion = await this.context.get().cloud.executeCommandInHostOS(
                        `balena exec resin_supervisor cat package.json | grep version`,
                        this.context.get().balena.uuid
                    )
                    console.log(updatedsupervisorVersion)
                    updatedsupervisorVersion = updatedsupervisorVersion.split(' ')
                    console.log(updatedsupervisorVersion)
                    updatedsupervisorVersion = updatedsupervisorVersion.replace(`"`, "")
                    console.log(updatedsupervisorVersion)
                    updatedsupervisorVersion = updatedsupervisorVersion.replace(`,`, "")
                    console.log(updatedsupervisorVersion)
					return updatedsupervisorVersion === supervisorVersion
				},false);
               

                test.is(
                    supervisorVersion,
                    updatedsupervisorVersion,
                    `Supervisor should have same version that it started with`
                )

                //* balena ps shows resin_supervisor running
                test.comment(`checking supervisor is running again...`)
                let supervisorRunning = await this.context.get().cloud.executeCommandInHostOS(
                    `balena ps | grep supervisor`,
                    this.context.get().balena.uuid
                )

                test.is(
                    (supervisorRunning !== ""),
                    true,
                    `Supervisor should now be running`
                )


                // when supervisor updated, you should see that the supervisor downloads the app - need to check its the right app somehow (logs??)
                await this.context.get().utils.waitUntil(async () => {
					test.comment("Checking if expected services are all running...")
					let services = await this.context.get().cloud.balena.models.device.getWithServiceDetails(this.context.get().balena.uuid)
					return (services.current_services.main[0].status === "Running")
					
				},false);

				test.ok(true, `Device should have downloaded services from original app`)
                
            },

        },
        {
            title: 'Override lock test',
            run: async function(test) {
                test.comment(`Cloning repo...`)
                await exec(`git clone https://github.com/balena-io-examples/balena-updates-lock.git ${__dirname}/lock`)

                test.comment(`Pushing release...`)
                await exec(`balena push ${this.context.get().balena.application} --source ${__dirname}/lock`)

                // wait till its running - check for lockfile
        
                await this.context.get().utils.waitUntil(async () => {
					test.comment("Checking if lockfile has been created...")
					
                    let containerId = await this.context.get().cloud.executeCommandInHostOS(
						`balena ps --format "{{.Names}}" | grep main`,
						this.context.get().balena.uuid
					)

                    let lockfile = await this.context.get().cloud.executeCommandInHostOS(
                        `balena exec ${containerId} ls /tmp/balena`,
                        this.context.get().balena.uuid
                    )
                    console.log(lockfile)
					return (lockfile === `update.lock`)
				},false);

                // push original application 
                await exec(`balena push ${this.context.get().balena.application} --source ${__dirname}/../../app`)

                // check original application is downloaded - shouldn't be installed
                await this.context.get().utils.waitUntil(async () => {
					test.comment("Checking if expected services are all running...")
					let device = await this.context.get().cloud.balena.models.device.get(this.context.get().balena.uuid)
                    let services = await this.context.get().cloud.balena.models.device.getWithServiceDetails(this.context.get().balena.uuid)
                    let supervisorState = await this.context.get().cloud.balena.models.device.getSupervisorTargetState(this.context.get().balena.uuid)
					console.log(device)
                    console.log(services)
                    console.log(supervisorState)
					return false
				},false);


                // enable lock override
                await this.context.get().cloud.balena.models.device.configVar.set(
                    this.context.get().balena.uuid,
                    'BALENA_SUPERVISOR_OVERRIDE_LOCK', 
                    1
                );
                // check original application gets installed
                await this.context.get().utils.waitUntil(async () => {
					test.comment("Checking if expected services are all running...")
					let device = await this.context.get().cloud.balena.models.device.get(this.context.get().balena.uuid)
                    let services = await this.context.get().cloud.balena.models.device.getWithServiceDetails(this.context.get().balena.uuid)
                    let supervisorState = await this.context.get().cloud.balena.models.device.getSupervisorTargetState(this.context.get().balena.uuid)
					console.log(device)
                    console.log(services)
                    console.log(supervisorState)
					return false
				},false);

                // check lock override is disabled
                let lock = await this.context.get().cloud.balena.models.device.configVar.get(
                    this.context.get().balena.uuid,
                    'BALENA_SUPERVISOR_OVERRIDE_LOCK'
                );
                console.log(lock)

            }
        }
    ]
}    
