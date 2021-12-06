import * as Bluebird from 'bluebird';
import * as retry from 'bluebird-retry';
import { ChildProcess, spawn, exec } from 'child_process';
import * as sdk from 'etcher-sdk';
import { EventEmitter } from 'events';
import { assignIn } from 'lodash';
import { fs } from 'mz';
import { dirname, join } from 'path';
import * as Stream from 'stream';
import { manageHandlers } from '../helpers';
import ScreenCapture from '../helpers/graphics';
import { promisify } from 'util';
const execProm = promisify(exec)
const fp = require("find-free-port");

Bluebird.config({
	cancellation: true,
});

class QemuWorker extends EventEmitter implements Leviathan.Worker {
	private image: string;
	private activeFlash?: Bluebird<void>;
	private signalHandler: (signal: NodeJS.Signals) => Promise<void>;
	private qemuProc: ChildProcess | null = null;
	private dnsmasqProc: ChildProcess | null = null;
	private internalState: Leviathan.WorkerState = { network: {wired: 'enp0s3'} };
	private screenCapturer: ScreenCapture;
	private qemuOptions: Leviathan.QemuOptions;
	private iptablesComment: string

	constructor(options: Leviathan.Options) {
		super();

		if (options != null) {
			this.image =
				options.worker != null && options.worker.disk != null
					? options.worker.disk
					: '/data/os.img';

			if (options.screenCapture) {
				this.screenCapturer = new ScreenCapture(
					{
						type: 'rfbsrc',
						options: {
							host: '127.0.0.1',
							port: '5900',
						},
					},
					join(options.worker.workdir, 'capture')
				)
			}
		}

    if (options.qemu) {
      this.qemuOptions = options.qemu;
      console.log("QEMU options:");
      console.log(this.qemuOptions);
    }

		this.iptablesComment = `teardown-${this.qemuOptions.network.bridgeName}`
		this.signalHandler = this.teardown.bind(this);
	}

	public get state() {
		return this.internalState;
	}

	public async setup(): Promise<void> {
		let checkPortForwarding = await execProm(`cat /proc/sys/net/ipv4/ip_forward`);
		if(checkPortForwarding.stdout.trim() !== '1'){
			throw new Error(`Kernel IP forwarding required for virtualized device networking, enable with 'sysctl -w net.ipv4.ip_forward=1'`);
		}

		manageHandlers(this.signalHandler, {
			register: true,
		});
	}

	public async teardown(signal?: NodeJS.Signals): Promise<void> {
		await this.powerOff();

		manageHandlers(this.signalHandler, {
			register: false,
		});

		if (this.screenCapturer != null) {
			await this.screenCapturer.teardown();
		}

		// remove iptables rules set up from host
		try{
			await execProm(`iptables-legacy-save | grep -v 'comment ${this.iptablesComment}' | iptables-legacy-restore`)
		} catch (e){
			console.log(`error while removing iptables rules: ${e}`)
		}

		try{
			await execProm(`ip link set dev ${this.qemuOptions.network.bridgeName} down`);
			await execProm(`brctl delbr ${this.qemuOptions.network.bridgeName}`);
		} catch(e){
			console.log(`error while removing bridge: ${e}`)
		}

		await new Promise((resolve, reject) => {
			if (this.dnsmasqProc && !this.dnsmasqProc.killed) {
				// don't return until the process is dead
				this.dnsmasqProc.on('exit', resolve);
				this.dnsmasqProc.kill();
			} else {
				resolve();
			}
		});
	}

	public async flash(stream: Stream.Readable): Promise<void> {
		this.activeFlash = new Bluebird(async (resolve, reject) => {
			await this.powerOff();

			const source = new sdk.sourceDestination.SingleUseStreamSource(stream);

			const destination = new sdk.sourceDestination.File(
				this.image,
				sdk.sourceDestination.File.OpenFlags.ReadWrite,
			);

			await sdk.multiWrite.pipeSourceToDestinations(
				source,
				[destination],
				(_destination, error) => {
					reject(error);
				},
				(progress: sdk.multiWrite.MultiDestinationProgress) => {
					this.emit('progress', progress);
				},
				true,
			);

			// Image files must be resized using qemu-img to create space for the data partition
			console.log(`Resizing qemu image...`)
			await execProm(`qemu-img resize -f raw ${this.image} 8G`)
			console.log(`qemu image resized!`)

			resolve();
		});

		await this.activeFlash;
		this.activeFlash = undefined;
	}

	public async powerOn(): Promise<void> {
		let deviceArch = this.qemuOptions.architecture;
		let baseArgs = [
			'-nographic',
			'-m', this.qemuOptions.memory,
			'-smp', this.qemuOptions.cpus,
			'-drive', 'format=raw,file=/data/os.img,if=virtio',
		];
		let archArgs: { [arch: string]: Array<string> } = {
			'x86_64': [
				'-M', 'pc',
				'--enable-kvm',
				'-cpu', 'max'
			],
			'aarch64': [],
		};
		let networkArgs = ['-net', 'nic,model=e1000',
                       '-net', `bridge,br=${this.qemuOptions.network.bridgeName}`];
		let firmwareArgs: { [arch: string]: Array<string> } = {
			'x86_64': ['-bios', '/usr/share/OVMF/OVMF_CODE.fd'],
			'aarch64': ['-bios', '/usr/share/qemu-efi-aarch64/QEMU_EFI.fd'],
		};
		// find a free tcp port for the qemu device qmp arguement - if we try to use a port already assigned, the spawning of the device fails
		let tcpPort = await fp(5700, 5800, '127.0.0.1', 1);

		let qmpArgs = ['-qmp', `tcp:localhost:${tcpPort[0]},server,nowait`];
		let args = baseArgs.concat(
			archArgs[deviceArch]).concat(
			networkArgs).concat(
			firmwareArgs[deviceArch]).concat(
			qmpArgs);

		if (this.screenCapturer != null) {
			let gfxArgs = [
				'-vnc', `:${this.qemuOptions.multiple}`,
			];

			args = args.concat(gfxArgs);
		}

		return new Promise((resolve, reject) => {
			let options = {};
			if (this.qemuOptions.debug) {
				options = {stdio: 'inherit'};
			}

			this.qemuProc = spawn(`qemu-system-${deviceArch}`, args, options);
			this.qemuProc.on('exit', (code, signal) => {
				reject(new Error(`QEMU exited with code ${code}`));
			});
			this.qemuProc.on('error', (err) => {
				reject(err);
			});

			resolve();
		});
	}

	public async powerOff(): Promise<void> {
		console.log("Qemu: powerOff()");
		return new Promise((resolve, reject) => {
			if (this.qemuProc && !this.qemuProc.killed) {
				// don't return until the process is dead
				this.qemuProc.on('exit', resolve)
				this.qemuProc.kill();
			} else {
				resolve();
			}
		});
	}

	private async iptablesRules(bridgeName: string, bridgeAddress: string){
		await execProm(`iptables-legacy -t nat -A POSTROUTING ! -o ${bridgeName} --source ${bridgeAddress}/24 -j MASQUERADE -m comment --comment ${this.iptablesComment}`);
	}

	// gets an unused ip address to assign the bridge interface we create - this is to avoid conflicts when multiple workers are running
	private async getUnusedAddress(){
		let nmap = await execProm(`nmap -v -sn -n 192.168.10${this.qemuOptions.multiple}.1-100 -oG - | awk '/Status: Down/{print $2}' | head -n 1`);
		return nmap.stdout.trim();
	}

	private async createBridge(bridgeName: string): Promise<void> {
		return new Promise((resolve, reject) => {
			spawn(
				'brctl', ['addbr', bridgeName]
			).on('exit', (code) => {
				if (code == 0) {
					resolve();
				} else {
					reject(new Error(`failed creating bridge ${bridgeName} with code ${code}`));
				}
			});
		}).then(() => {
			return new Promise((resolve, reject) => {
				spawn(
					'ip', ['link', 'set', 'dev', bridgeName, 'up']
				).on('exit', (code) => {
					if (code == 0) {
						resolve();
					} else {
						reject(new Error(`failed to bring interface ${bridgeName} up with code ${code}`));
					}
				});
			});
		}).then(() => {
			return new Promise(async (resolve, reject) => {
				let bridgeAddress = await this.getUnusedAddress();
				await this.iptablesRules(bridgeName, bridgeAddress);
				spawn(
					'ip', ['addr', 'add', `${bridgeAddress}/24`, 'dev', bridgeName]
				).on('exit', (code) => {
					if (code == 0) {
						resolve();
					} else {
						reject(new Error(`failed assigning address to interface ${bridgeName} with code ${code}`));
					}
				});
			});
		});
	}

	private async setupBridge(bridgeName: string): Promise<void> {
		return new Promise((resolve, reject) => {
			spawn('brctl', ['show', bridgeName]).on('exit', (code) => {
				if (code == 0) {
					resolve();
				} else {
					resolve(this.createBridge(bridgeName));
				}
			});
		});
	}

	public async network(configuration: {
		wired?: { nat: boolean };
	}): Promise<void> {
    const bridgeName: string = this.qemuOptions.network.bridgeName;
    const dnsmasqArgs = [
      `--interface=${bridgeName}`,
      `--dhcp-range=192.168.10${this.qemuOptions.multiple}.2,192.168.10${this.qemuOptions.multiple}.254`,
      '--conf-file',
	  '--except-interface=lo', // may not be needed TEST
      '--bind-interfaces',
      '--no-daemon',
      `--dhcp-leasefile=/var/run/qemu-dnsmasq-${bridgeName}.leases`,
    ];

		// Disable DNS entirely, as we only require DHCP and this avoids problems
		// with running multiple instances of dnsmasq concurrently
		dnsmasqArgs.push('--port=0');

		return this.setupBridge(bridgeName).then(() => {
			return new Promise((resolve, reject) => {
				this.dnsmasqProc = spawn('dnsmasq', dnsmasqArgs, {stdio: 'inherit'});

				this.dnsmasqProc.on('exit',
					(code, signal) => {
						console.log(`dnsmasq exited with ${code}`)
						if (code != 0) {
							throw new Error(`dnsmasq exited with code ${code}`);
						}
					}
				);

				this.dnsmasqProc.on('error',
					(err: Error) => {
						console.log("error launching dnsmasq");
						reject(err);
					}
				);
				resolve();
			});
		});
	}

	public async captureScreen(
		action: 'start' | 'stop',
	): Promise<void | Stream.Readable> {
		if (this.screenCapturer == null) {
			throw new Error('Screen capture not configured');
		}

		switch (action) {
			case 'start':
				return this.screenCapturer.startCapture();
			case 'stop':
				return this.screenCapturer.stopCapture();
		}
	}
}

export default QemuWorker;
