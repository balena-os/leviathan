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
const execProm = promisify(exec);
const fp = require('find-free-port');

Bluebird.config({
	cancellation: true,
});

const dutSerialPath = '/reports/dut-serial.txt';

class QemuWorker extends EventEmitter implements Leviathan.Worker {
	private image: string;
	private activeFlash?: Bluebird<void>;
	private signalHandler: (signal: NodeJS.Signals) => Promise<void>;
	private qemuProc: ChildProcess | null = null;
	private dnsmasqProc: ChildProcess | null = null;
	private internalState: Leviathan.WorkerState = {
		network: { wired: 'enp0s3' },
	};
	private screenCapturer: ScreenCapture;
	private qemuOptions: Leviathan.QemuOptions;
	private iptablesComment: string;
	private bridgeAddress: string;
	private bridgeName: string;
	private dhcpRange: string;

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
					join(options.worker.workdir, 'capture'),
				);
			}
		}

		if (options.qemu) {
			this.qemuOptions = options.qemu;
			console.debug('QEMU options:');
			console.debug(this.qemuOptions);
		}

		this.bridgeAddress = '';
		this.bridgeName = '';
		this.dhcpRange = '';
		this.iptablesComment = `teardown`;
		this.signalHandler = this.teardown.bind(this);
	}

	public get state() {
		return this.internalState;
	}

	public async setup(): Promise<void> {
		const checkPortForwarding = await execProm(
			`cat /proc/sys/net/ipv4/ip_forward`,
		);
		if (checkPortForwarding.stdout.trim() !== '1') {
			throw new Error(
				`Kernel IP forwarding required for virtualized device networking, enable with 'sysctl -w net.ipv4.ip_forward=1'`,
			);
		}

		manageHandlers(this.signalHandler, {
			register: true,
		});
	}

	// Method to pull any relevant information about the worker to be used into tests
	public async diagnostics() {
		return {
			// Add diagnostics information to be qeuried as needed
		}
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
		try {
			await execProm(
				`iptables-legacy-save | grep -v 'comment ${this.iptablesComment}' | iptables-legacy-restore`,
			);
		} catch (e) {
			console.error(`error while removing iptables rules: ${e}`);
		}

		try {
			await execProm(`ip link set dev ${this.bridgeName} down`);
			await execProm(`brctl delbr ${this.bridgeName}`);
		} catch (e) {
			console.error(`error while removing bridge: ${e}`);
		}

		await new Promise<void>((resolve, reject) => {
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
			console.debug(`Resizing qemu image...`);
			await execProm(`qemu-img resize -f raw ${this.image} 8G`);
			console.debug(`qemu image resized!`);

			resolve();
		});

		await this.activeFlash;
		this.activeFlash = undefined;
	}

	public async powerOn(): Promise<void> {
		console.log('QEMU: powerOn');

		let vncport = null;
		let qmpPort = null;

		if (this.qemuOptions.network.vncPort === null) {
			const port = await fp(
				this.qemuOptions.network.vncMinPort,
				this.qemuOptions.network.vncMaxPort,
				'127.0.0.1',
				1,
			);
			vncport = port[0];
		} else {
			vncport = this.qemuOptions.network.vncPort;
		}

		if (this.qemuOptions.network.qmpPort === null) {
			const port = await fp(
				this.qemuOptions.network.qmpMinPort,
				this.qemuOptions.network.qmpMaxPort,
				'127.0.0.1',
				1,
			);
			qmpPort = port[0];
		} else {
			qmpPort = this.qemuOptions.network.qmpPort;
		}

		// The VNC arguement for qemu-system requires a port to be specified relative to 5900
		const vncDisplay = vncport - 5900;

		const deviceArch = this.qemuOptions.architecture;
		const baseArgs = [
			'-nographic',
			'-m',
			this.qemuOptions.memory,
			'-smp',
			this.qemuOptions.cpus,
			'-drive',
			'format=raw,file=/data/os.img,if=virtio',
			'-serial',
			`file:${dutSerialPath}`,
		];

		// Basic mapping of node process.arch to matching qemu target architecture
		// This ensures we only enable KVM on compatible architectures
		function kvmTargetCompatible(arch: string) {
			const archMap: { [index: string]: string[] } = {
				x64: ['x86_64'],
				arm64: ['aarch64'],
			};

			return archMap[process.arch].includes(arch);
		}

		if (fs.existsSync('/dev/kvm') && kvmTargetCompatible(deviceArch)) {
			baseArgs.push('--enable-kvm');
			console.log('Enabling KVM hardware accelerated virtualization');
		} else {
			console.log('KVM is unavailable, falling back on software emulation');
		}

		const archArgs: { [arch: string]: string[] } = {
			x86_64: ['-M', 'q35', '-cpu', 'max'],
			aarch64: [],
		};
		const networkArgs = [
			'-net',
			'nic,model=e1000',
			'-net',
			`bridge,br=${this.bridgeName}`,
		];
		// Setup OVMF with emulated flash, UEFI variables, and secure boot support.
		// https://github.com/tianocore/edk2/blob/e1e7306b54147e65cb7347b060e94f336d4a82d2/OvmfPkg/README#L60
		//
		// Disable S3 support to work around a Debian bug
		// https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=973783
		const firmwareArgs: { [arch: string]: string[] } = {
			x86_64: [
				'-global',
				'driver=cfi.pflash01,property=secure,value=on',
				'-global',
				'ICH9-LPC.disable_s3=1',
				'-drive',
				`if=pflash,format=raw,unit=0,file=${this.qemuOptions.firmware.code},readonly=on`,
				'-drive',
				`if=pflash,format=raw,unit=1,file=${this.qemuOptions.firmware.vars},readonly=on`,
			],
			aarch64: ['-bios', this.qemuOptions.firmware.code],
		};
		const qmpArgs = ['-qmp', `tcp:localhost:${qmpPort},server,nowait`];
		let args = baseArgs
			.concat(archArgs[deviceArch])
			.concat(networkArgs)
			.concat(firmwareArgs[deviceArch])
			.concat(qmpArgs);

		if (this.screenCapturer != null) {
			const gfxArgs = ['-vnc', `:${vncDisplay}`];

			args = args.concat(gfxArgs);
		}

		return new Promise((resolve, reject) => {
			let options = {};
			if (this.qemuOptions.debug) {
				options = { stdio: 'inherit' };
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
		console.log('QEMU: powerOff');
		return new Promise((resolve, reject) => {
			if (this.qemuProc && !this.qemuProc.killed) {
				// don't return until the process is dead
				this.qemuProc.on('exit', resolve);
				this.qemuProc.kill();
			} else {
				resolve();
			}
		});
	}

	private async iptablesRules(bridgeName: string, bridgeAddress: string) {
		this.iptablesComment = `teardown_${bridgeName}`;
		await execProm(
			`iptables-legacy -t nat -A POSTROUTING ! -o ${bridgeName} --source ${bridgeAddress}/24 -j MASQUERADE -m comment --comment ${this.iptablesComment}`,
		);
	}

	private async getBridgeIpAddress() {
		const interfaces = JSON.parse((await execProm(`ip -json a`)).stdout);
		let subnet = 10;
		while (subnet < 255) {
			const subenetAddr = `10.10.${subnet}.1`;
			let addrUsed = false;
			interfaces.forEach((iface: any) => {
				iface.addr_info.forEach((addr: any) => {
					if (subenetAddr === addr.local) {
						addrUsed = true;
					}
				});
			});
			if (!addrUsed) {
				console.log(`Found unused IP subnet address ${subenetAddr}`);
				break;
			} else {
				subnet++;
			}
		}

		if (subnet > 254) {
			throw new Error(`Could not find unused IP address!`);
		}

		return `10.10.${subnet}`;
	}

	private async createBridge(
		bridgeName: string,
		bridgeAddress: string,
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			spawn('brctl', ['addbr', bridgeName]).on('exit', (code) => {
				if (code === 0) {
					console.debug(`added bridge ${bridgeName}...`);
					resolve();
				} else {
					reject(
						new Error(`failed creating bridge ${bridgeName} with code ${code}`),
					);
				}
			});
		})
			.then(() => {
				return new Promise<void>((resolve, reject) => {
					spawn('ip', ['link', 'set', 'dev', bridgeName, 'up']).on(
						'exit',
						(code) => {
							if (code === 0) {
								console.debug(`set ${bridgeName} link to up...`);
								resolve();
							} else {
								reject(
									new Error(
										`failed to bring interface ${bridgeName} up with code ${code}`,
									),
								);
							}
						},
					);
				});
			})
			.then(() => {
				return new Promise((resolve, reject) => {
					spawn('ip', [
						'addr',
						'add',
						`${bridgeAddress}/24`,
						'dev',
						bridgeName,
					]).on('exit', (code) => {
						if (code === 0) {
							console.debug(`added ${bridgeAddress}/24 to ${bridgeName}...`);
							resolve();
						} else {
							reject(
								new Error(
									`failed assigning address to interface ${bridgeName} with code ${code}`,
								),
							);
						}
					});
				});
			});
	}

	private async setupBridge(
		bridgeName: string,
		bridgeAddress: string,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			spawn('brctl', ['show', bridgeName]).on('exit', (code) => {
				if (code === 0) {
					resolve();
				} else {
					resolve(this.createBridge(bridgeName, bridgeAddress));
				}
			});
		});
	}

	public async network(configuration: {
		wired?: { nat: boolean };
	}): Promise<void> {
		if (this.qemuOptions.network.bridgeName === null) {
			// generate random bridge name
			const id = `${Math.random().toString(36).substring(2, 10)}`;
			this.bridgeName = `br${id}`;
		} else {
			this.bridgeName = this.qemuOptions.network.bridgeName;
		}

		if (this.qemuOptions.network.bridgeAddress === null) {
			// generate bridge subnet
			// e.g '10.10.10.X'
			const ip = await this.getBridgeIpAddress();

			// Assign ip address to bridge
			// e.g '10.10.10.1'
			this.bridgeAddress = `${ip}.1`;
			// generate dhcpRange for dnsmasq
			// e.g '10.10.10.2,10.10.10.254'
			this.dhcpRange = `${ip}.2,${ip}.254`;
		} else {
			this.bridgeAddress = this.qemuOptions.network.bridgeAddress;
			if (this.qemuOptions.network.dhcpRange === null) {
				throw new Error(
					'If manually providing a bridge address, must also specify a DHCP range!',
				);
			} else {
				this.dhcpRange = this.qemuOptions.network.dhcpRange;
			}
		}

		const dnsmasqArgs = [
			`--interface=${this.bridgeName}`,
			`--dhcp-range=${this.dhcpRange}`,
			'--conf-file',
			'--except-interface=lo',
			'--bind-interfaces',
			'--no-daemon',
			`--dhcp-leasefile=/var/run/qemu-dnsmasq-${this.bridgeName}.leases`,
		];

		// Disable DNS entirely, as we only require DHCP and this avoids problems
		// with running multiple instances of dnsmasq concurrently
		dnsmasqArgs.push('--port=0');

		return this.setupBridge(this.bridgeName, this.bridgeAddress).then(() => {
			return new Promise(async (resolve, reject) => {
				await this.iptablesRules(this.bridgeName, this.bridgeAddress);
				this.dnsmasqProc = spawn('dnsmasq', dnsmasqArgs, { stdio: 'inherit' });

				this.dnsmasqProc.on('exit', (code, signal) => {
					console.debug(`dnsmasq exited with ${code}`);
					if (code !== 0) {
						throw new Error(`dnsmasq exited with code ${code}`);
					}
				});

				this.dnsmasqProc.on('error', (err: Error) => {
					console.error('error launching dnsmasq');
					reject(err);
				});
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
