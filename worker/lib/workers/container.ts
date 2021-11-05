import * as Bluebird from 'bluebird';
import * as retry from 'bluebird-retry';
import { exec, ChildProcess, spawn } from 'child_process';
import * as sdk from 'etcher-sdk';
import { EventEmitter } from 'events';
import * as libvirt from 'libvirt';
import { assignIn } from 'lodash';
import { fs } from 'mz';
import { dirname, join } from 'path';
import * as Stream from 'stream';
import * as xml from 'xml-js';
import { manageHandlers } from '../helpers';
import ScreenCapture from '../helpers/graphics';
import { promisify } from 'util';
import { ensureFile } from 'fs-extra';
const execP = promisify(exec)

Bluebird.config({
	cancellation: true,
});

class Container extends EventEmitter implements Leviathan.Worker {
	private image: string;
	private config: string
	private osProc?: ChildProcess;
	private dockerProc?: ChildProcess;

	private signalHandler: (signal: NodeJS.Signals) => Promise<void>;
	private internalState: Leviathan.WorkerState = { network: {} };

	constructor(options: Leviathan.Options) {
		super();
		this.image = `/data/os.img`;
		this.config = `/data/config.json`;
		this.signalHandler = this.teardown.bind(this);
	}

	public get state() {
		return this.internalState;
	}

	private static generateId(): string {
		return Math.random()
			.toString(36)
			.substring(2, 10);
	}

	public async setup(): Promise<void> {
		const dockerJson = `{"storage-driver": "overlay2","graph": "/data","dns": ["8.8.8.8"],"iptables": false}`
		await ensureFile(`/etc/docker/daemon.json`)
		await fs.writeFileSync(`/etc/docker/daemon.json`, dockerJson)	  
		
		try{
			await execP(`rm -rf /var/run/docker.pid`)
		} catch {
			console.log(`No previous docker pid`)
		}
		this.dockerProc = exec('dockerd &')

		// pulling from my own branch at the moment - maybe make a PR on that repo to allow for custom builds 
        try {
			await execP(`git clone -b ryan/build-from-saved-img https://github.com/balena-os/balenaos-in-container.git ${__dirname}/container`)
		} catch(e){
			console.log(e)
		}

		manageHandlers(this.signalHandler, {
			register: true,
		});
	}

	public async teardown(signal?: NodeJS.Signals): Promise<void> {
		if (signal != null) {
			if (signal === 'SIGTERM' || signal === 'SIGINT') {
				if (this.osProc != null) {
					this.osProc.kill();
					this.osProc = undefined;
				}
			}

			process.kill(process.pid, signal);
		}

		if (this.osProc != null) {
			this.osProc.kill();
			this.osProc = undefined;
		}

		try{
			await execP(`${__dirname}/container docker-compose down -v`);
		}catch{
			console.log(`no balenaos containers running - no removal required`)
		}

		manageHandlers(this.signalHandler, {
			register: false,
		});
	}

	public async flash(stream: Stream.Readable): Promise<void> {
		// we need to get the config.json... 
        // For now, just look at a volume - but we want a better way of getting this here imo
		await fs.copyFileSync(this.config, `${__dirname}/container/config.json`);
		
		// do a docker load - need to get sha from it and inject into the dockerfile via build arg
		const { stdout, stderr } = await execP(`docker load < ${this.image}`);
		let sha = stdout.replace('Loaded image ID: ', '')
		let shaReplace = sha.replace(/(\r\n|\n|\r)/gm, "") // could be doing this cleaner
		// no-cache arguement here because sometimes it was building an old image
		let build = exec(`cd ${__dirname}/container && docker-compose build --build-arg SHA=${shaReplace} --no-cache`);
	}

	public async powerOn(): Promise<void> {
		this.osProc = exec(`cd ${__dirname}/container && docker-compose up --force-recreate`);
	}

	// maybe off a powerdown option - but it won't really be useful afaik
	public async powerOff(): Promise<void> {
		return
	}

	// no networm config required - so just return
	public async network(configuration: {
		wired?: { nat: boolean };
	}): Promise<void> {
		return
	}

	public async captureScreen(
		action: 'start' | 'stop',
	): Promise<void | Stream.Readable> {
		throw new Error(`balena-os in container cannot perform screen capture!`)
	}
}

export default Container;
