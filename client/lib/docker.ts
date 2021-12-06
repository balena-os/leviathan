import { existsSync, createWriteStream } from 'fs'
import * as Docker from 'dockerode';
import * as tar from 'tar-fs';


interface Containers{
	core: Docker.Container,
	worker: Docker.Container,
	volumes: string[]
}

export class ContainerInteractor{
	docker: Docker;
	containerArray: Containers[];

	constructor() { 
		this.docker = new Docker({socketPath: '/var/run/docker.sock'});
		this.containerArray = [];
	}
	
	public async createCoreWorker(ports: number[]) {
		let corePort = ports[0];
		let workerPort = ports[1];
		
		let coreOpts = {
			Image: '',
			OpenStdin: true,
			Env: [
				`UDEV=0`,
				`WORKER_TYPE=qemu`,
			],
			AttachStdout: true,
			AttachStderr: true,
			HostConfig: {
				Privileged: true,
				NetworkMode: `host`,
				Mounts: Array<any>()
			}
		}

		let workerOpts = {
			Image: '',
			OpenStdin: true,
			Env: [
				`UDEV=0`,
				`WORKER_TYPE=qemu`,
			],
			AttachStdout: true,
			AttachStderr: true,
			Devices:[
				{
					PathOnHost: "/dev/net/tun",
					PathInContainer: "/dev/net/tun"
				},
				{
					PathOnHost: "/dev/kvm",
					PathInContainer: "/dev/kvm"
				}
			],
			CapAdd: [
				"NET_ADMIN"
			],
			HostConfig: {
				Privileged: true,
				NetworkMode: `host`,
				Mounts: Array<any>()
			}
		}
		
		// We actually need a way to generate a unique ip address to assign the virtual interface we create, to avoid conflicts when multiple jobs run on the same jenkins worker
		let env = [
			`UDEV=0`,
			`WORKER_TYPE=qemu`,
			`WORKER_PORT=${workerPort}`,
			`CORE_PORT=${corePort}`,
			`SCREEN_CAPTURE=true`,
			`QEMU_MULTIPLE=${this.containerArray.length}`, // this number is passed to the worker to it can determine a unique ip address, vnc port and dhcp range
			`QEMU_BRIDGE_NAME=br${corePort}`,
		]

		// volume names - we make them unique to each of the containers we spawn to avoid overlap
		let coreStorage = `core-storage-${corePort}`;
		let reports = `reports-${corePort}`;
		// options to mount named volumes to the containers
		let mounts = [
			{
				Target:   "/data",
				Source:   coreStorage,
				Type:     "volume", 
				ReadOnly: false
			},
			{
				Target:   "/reports",
				Source:   reports,
				Type:     "volume", 
				ReadOnly: false
			}
		]

		// Fill in the remaining options - we do that here as we need the port name for the env variables + volume name
		coreOpts.Env = env;
		coreOpts.HostConfig.Mounts = mounts;
		workerOpts.Env = env;
		workerOpts.HostConfig.Mounts = mounts;

		await this.docker.createVolume(coreStorage);
		await this.docker.createVolume(reports);
		let core = await this.createContainer(`${__dirname}/../../../core`, `core`, corePort, coreOpts);
		let worker = await this.createContainer(`${__dirname}/../../../worker`, `worker`, workerPort, workerOpts);

		this.containerArray.push(
			{
				core: core,
				worker: worker,
				volumes:[
					coreStorage,
					reports
				]
			}
		)
	}


	public async teardown(){
		try{
			for(let container of this.containerArray){
				console.log(`Stopping ${container.core.id}...`)
				await container.core.stop();
				console.log(`Removing ${container.core.id}...`)
				await container.core.remove();
				console.log(`Stopping ${container.worker.id}...`)
				await container.worker.stop();
				console.log(`Removing ${container.worker.id}...`)
				await container.worker.remove();
	
				// remove volumes
				console.log(`Removing volumes`)
				for (let volumeName of container.volumes){
					let volume = await this.docker.getVolume(volumeName);
					await volume.remove({force: true});
				}
			}
		} catch(e){
			console.log(e)
		}
	}

	private async createContainer(dir: string, name: string, port: number, opts: any) {
		console.log(`Creating ${name} container, listening on port ${port}`);
		let imgTag = `${name}_${port}`;
		let archive = `${name}.tar`;
		
		// we must create an archive of the core directory to be able to use it with dockerode build
		if(!existsSync(archive)){
			console.log(`Creating archive of container files...`);
			let pack = tar.pack(dir).pipe(createWriteStream(archive));
			await new Promise((resolve, _reject) => {
				pack.on(`finish`, () => {
					console.log(`Finished creating archive!`);
					resolve();
				})
			});
		} else{
			console.log(`Archive of container files already exists - skipping...`)
		}

		console.log(`Building container ${imgTag}....`);
		// build container - after the first time it will build from cache
		let stream = await this.docker.buildImage(
			archive,
			{t: imgTag, buildargs: {SKIP_INSTALL_BINARY: "true"}}
		);

		// this monitors the build progree, and waits until the build is finished before continuing
		await new Promise((resolve, reject) => {
			this.docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
		});

		console.log(`Container ${imgTag} built! Starting container...`);
		// create container, with ports env vars
		opts.Image = imgTag;
		const container = await this.docker.createContainer(
			opts
		);
		await container.start()
		console.log(`Container ${imgTag} started!`)

		return container;
	}
}




				