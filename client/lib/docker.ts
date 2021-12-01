//const tar = require('tar-fs')
//const Docker = require('dockerode');
//const docker = new Docker({socketPath: '/var/run/docker.sock'});
//const getPort = require('get-port');

import { existsSync, createWriteStream } from 'fs'
import * as Docker from 'dockerode';
import * as tar from 'tar-fs';

export class ContainerInteractor{
	docker: Docker;
	constructor() { 
		this.docker = new Docker({socketPath: '/var/run/docker.sock'});
	}
	
	async createCoreWorker(ports: number[]) {
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
				Mounts: [
					{
						Target:   "/data",
						Source:   "core-storage",
						Type:     "volume", 
						ReadOnly: false
					},
					{
						Target:   "/reports",
						Source:   "reports",
						Type:     "volume", 
						ReadOnly: false
					}
				]
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
				Mounts: [
					{
						Target:   "/data",
						Source:   "core-storage",
						Type:     "volume", 
						ReadOnly: false
					},
					{
						Target:   "/reports",
						Source:   "reports",
						Type:     "volume", 
						ReadOnly: false
					}
				]
			}
		}

		console.log(`Found unused ports: ${corePort}, ${workerPort}`);
		
		let env = [
			`UDEV=0`,
			`WORKER_TYPE=qemu`,
			`WORKER_PORT=${workerPort}`,
			`CORE_PORT=${corePort}`,
			`SCREEN_CAPTURE=true`
		]

		coreOpts.Env = env;
		workerOpts.Env = env;
		await this.docker.createVolume(`core-storage`)
		await this.docker.createVolume(`reports`)
		let core = await this.createContainer(`${__dirname}/../../../core`, `core`, corePort, coreOpts);
		let worker = await this.createContainer(`${__dirname}/../../../worker`, `worker`, workerPort, workerOpts);

		return {
			core: core,
			worker: worker
		}
	}


	async createContainer(dir: string, name: string, port: number, opts: any) {
		console.log(`Creating ${name} container, listening on port ${port}`);
		let imgTag = `${name}_${port}`;
		let archive = `${name}.tar`;
		
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

		// build core container (what parameters)
		let stream = await this.docker.buildImage(
			archive,
			{t: imgTag, buildargs: {SKIP_INSTALL_BINARY: "true"}}
		);


		await new Promise((resolve, reject) => {
			this.docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
		});

		
		// create container, with ports env vars (maybe interface too?)
		opts.Image = imgTag;
		const container = await this.docker.createContainer(
			opts
		);
		await container.start()


		return container;
	}
}




				