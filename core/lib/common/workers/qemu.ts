import { ChildProcess, spawn, exec } from 'child_process';
import { fs } from 'mz';
import { basename } from 'path';
import { dirname } from 'path';
import * as Stream from 'stream';
import ScreenCapture from './graphics';
import { promisify } from 'util';
const qmp = require("@balena/node-qmp");
const execProm = promisify(exec);
import * as fp from 'find-free-port';
import Worker from '../worker'

const imagefs = require('balena-image-fs');
const util = require('util');

const dutSerialPath = 'dut-serial.txt';

class QemuWorker extends Worker {
	private id: string;
	private macaddr: string;
	private internalDisk: string | null = null;
	private externalDisk: string;
	get runtimeFirmwareVars() { return `/tmp/edk2-vars-${this.id}.fd`; }
	private flasherImage: boolean = false;
	private qemuProc: ChildProcess | null = null;
	private dnsmasqProc: ChildProcess | null = null;
	private internalState: Leviathan.WorkerState = {
		network: { wired: 'enp0s3' },
	};
	private screenCapturer: ScreenCapture | undefined;
	private qemuOptions: Leviathan.QemuOptions;
	private iptablesComment: string;
	private bridgeAddress: string;
	private bridgeName: string;
	private dhcpRange: string;

	constructor(options: Leviathan.RuntimeConfiguration) {
		super();

		this.id = `${Math.random().toString(36).substring(2, 10)}`;
		this.macaddr = '52:54:00:XX:XX:XX'.replace(/XX/g,
			(_) => Math.random().toString(16).slice(-2));

		this.externalDisk = 'externalDisk.img';
		this.internalDisk = 'internalDisk.img';

		if (options.screenCapture) {
			this.screenCapturer = new ScreenCapture(
				{
					type: 'rfbsrc',
					options: {
						host: '127.0.0.1',
						port: '5900',
					},
				},
				'capture',
			);
		}

		this.qemuOptions = Object.assign({}, options.qemu);
		console.debug('QEMU options:');
		console.debug(this.qemuOptions);

		this.bridgeAddress = '';
		this.bridgeName = 'qemu0';
		this.dhcpRange = '';
		this.iptablesComment = `teardown`;
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

		if (this.qemuOptions.firmware === undefined) {
			this.qemuOptions.firmware = await this.findUEFIFirmware(
				this.qemuOptions.architecture,
				this.qemuOptions.secureBoot,
			);
			if (this.qemuOptions.firmware) {
				console.log(
					'Found UEFI firmware: ' +
						JSON.stringify(this.qemuOptions.firmware, null, 2),
				);
			} else {
				const sbmsg = this.qemuOptions.secureBoot ? 'secureboot enabled ' : '';
				const fwpkg = this.qemuOptions.architecture === 'x86_64' ? 'OVMF'
					: this.qemuOptions.architecture === 'aarch64' ? 'AAVMF' : null;
				const helpmsg = this.qemuOptions.secureBoot ? `, check that ${fwpkg} is installed`: '';
				throw new Error(
					`Unable to find ${sbmsg}UEFI firmware${helpmsg}`,
				);
			}
		}
	}

	public async teardown(): Promise<void> {
		await this.off();

		if (this.screenCapturer != null) {
			await this.screenCapturer.teardown();
		}

		if (this.qemuOptions.network.autoconfigure) {
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

			await new Promise<void>((resolve) => {
				if (this.dnsmasqProc && !this.dnsmasqProc.killed) {
					// don't return until the process is dead
					this.dnsmasqProc.on('exit', resolve);
					this.dnsmasqProc.kill();
				} else {
					resolve();
				}
			});
		}
	}

	public async flash(filename: string): Promise<void> {
		await this.off();

		// Remove existing disk images
		for (let f of [this.internalDisk, this.externalDisk]) {
				if (fs.existsSync(f as string)) fs.unlinkSync(f as string);
		}

		// Copy firmware vars file to runtime location
		//
		// This allows the guest to write firmware vars including boot order and
		// secure boot vars while allowing tests to reset these vars by reflashing
		fs.copyFileSync(this.qemuOptions.firmware!.vars, this.runtimeFirmwareVars);
		console.log(`copied ${this.qemuOptions.firmware!.vars} to ${this.runtimeFirmwareVars}`);

		await execProm(`truncate -s 8G ${this.internalDisk} ${this.externalDisk}`);
		const loopDevice = this.qemuOptions.forceRaid
			? (await execProm(`losetup -fP --show ${this.internalDisk}`)).stdout.trim()
			: null;
		const arrayDevice = this.qemuOptions.forceRaid
			? `/dev/md/${this.id}`
			: null;
		try {
			if (this.qemuOptions.forceRaid) {
				console.log(`Creating a RAID array at ${arrayDevice}`);
				await execProm([
					'yes', '|',
						'mdadm',
							'--create',
							'--verbose',
							'--level=1',
							'--raid-devices=1',
							'--metadata=0.90',
							'--force',
							arrayDevice,
							loopDevice,
						'&&',
							'mdadm',
								'--stop',
								arrayDevice,
					].join(' ')
				);
			}

			fs.copyFileSync(filename, this.externalDisk);

			const bootPartition = 1;
			this.flasherImage = await imagefs.interact(
				this.externalDisk,
				bootPartition,
				async (_fs: typeof fs) => {
					return util.promisify(_fs.open)('/balena-image-flasher', 'r').then((fd: number) => {
						return util.promisify(_fs.close)(fd).then(() => { return true });
					}).catch((e: any) => {
						if ('ENOENT'.includes(e.code))
							return false;

						throw new Error('Unexpected error while inspecting OS image: ${e}');
					})
				},
			);

			if (this.flasherImage) {
				return new Promise((resolve, reject) => {
					this.runQEMU({
						listeners: { onExit: resolve },
						internalStorage: this.qemuOptions.internalStorage,
						externalStorage: this.qemuOptions.externalStorage,
						exitOnReset: !this.qemuOptions.internalStorage
					}).catch(e => {
						console.log(`Error running flasher: ${e}`);
						reject();
					});
				});
			}
		} finally {
			if (this.qemuOptions.forceRaid) {
				await execProm(`mdadm --stop ${arrayDevice}`);
				await execProm(`losetup -d ${loopDevice}`);
			}
		}
	}

	private async findUEFIFirmware(
		architecture: string,
		secboot: boolean = false,
	): Promise<undefined | { code: string; vars: string }> {
		const searchPaths: {
			[arch: string]: Array<{ code: string; secboot: string, vars: string }>;
		} = {
			x86_64: [
				{
					// alpine/debian/fedora/ubuntu
					code: '/usr/share/OVMF/OVMF_CODE.fd',
					secboot: '/usr/share/OVMF/OVMF_CODE.secboot.fd',
					vars: '/usr/share/OVMF/OVMF_VARS.fd',
				},
				{
					// alpine, qemu
					code: '/usr/share/qemu/edk2-x86_64-code.fd',
					secboot: '/usr/share/qemu/edk2-x86_64-secure-code.fd',
					vars: '/usr/share/qemu/edk2-i386-vars.fd',
				},
				{
					// archlinux
					code: '/usr/share/ovmf/x64/OVMF_CODE.fd',
					secboot: '/usr/share/ovmf/x64/OVMF_CODE.secboot.fd',
					vars: '/usr/share/ovmf/x64/OVMF_VARS.fd',
				},
			],
			aarch64: [
				{
					// alpine, ovmf
					code: '/usr/share/OVMF/QEMU_EFI.fd',
					secboot: '',
					vars: '/usr/share/OVMF/QEMU_VARS.fd',
				},
				{
					// alpine, qemu
					code: '/usr/share/qemu/edk2-aarch64-code.fd',
					secboot: '',
					vars: '/usr/share/qemu/edk2-arm-vars.fd',
				},
				{
					// fedora
					code: '/usr/share/AAVMF/AAVMF_CODE.fd',
					secboot: '',
					vars: '/usr/share/AAVMF/AAVMF_CODE.fd',
				},
			],
		};

		// Promise.any is only available in Node 15+
		return Promise.any(
			searchPaths[architecture].map((paths) => {
				return fs.access(paths.code).then(() => {
					return fs.access(paths.vars).then(() => {
						return {
							code: secboot ? paths.secboot : paths.code,
							vars: paths.vars,
						};
					});
				});
			}),
		);
	}

	private async assertFileExists(filePath: string, timeout: number) {
		return new Promise<void>( (resolve, reject) => {
			let timer = setTimeout( () => {
				watcher.close();
				reject(new Error(`Timed out waiting on ${filePath}`))
			}, timeout);
			fs.access(filePath, fs.constants.R_OK, (err: NodeJS.ErrnoException | null) => {
				if (!err) {
					clearTimeout(timer);
					watcher.close();
					resolve();
				}
			})
			let dir = dirname(filePath);
			let bname = basename(filePath);
			let watcher = fs.watch( dir, (eventType: string, filename: string) => {
				if (eventType === 'rename' && filename === bname) {
					clearTimeout(timer);
					watcher.close();
					resolve();
				}
			})
		})
	}

	private async killOnReset(ipc: string | number) {
			const client = new qmp.Client();
			client.connect(ipc);
			client.on('ready', () => {
				client.execute('query-status').then((status: string) => {
					console.debug(`Machine ${status}`);
				}).then(() => {
					console.log(`waiting on reset`)
					client.on('reset', () => {
						console.log('Virtual machine reset - killing emulator');
						this.qemuProc!.kill();
					});
				});
			});
		}

	private async runQEMU(
		options?: {
			listeners?: { onExit?: (...args: any[]) => void; };
			internalStorage?: boolean;
			externalStorage?: boolean;
			exitOnReset?: boolean;
		}
	): Promise<void> {
		let vncport = null;

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

		// The VNC arguement for qemu-system requires a port to be specified relative to 5900
		const vncDisplay = vncport - 5900;

		const deviceArch = this.qemuOptions.architecture;
		const baseArgs = [
			'-nographic',
			'-m',
			this.qemuOptions.memory,
			'-smp',
			this.qemuOptions.cpus,
			'-serial',
			`file:${dutSerialPath}`,
		];

		const internalStorageArgs = [
			'-drive', `format=raw,file=${this.internalDisk},media=disk`,
		];

		const externalStorageArgs = [
			'-drive', `format=raw,file=${this.externalDisk},if=none,id=ext0`,
			'-device', 'qemu-xhci',
			'-device', 'usb-storage,drive=ext0',
		];

		const tpmArgs = [
			'-chardev', `socket,id=chrtpm,path=/var/tpm0/swtpm.sock`,
			'-tpmdev', 'emulator,id=tpm0,chardev=chrtpm',
			'-device', 'tpm-tis,tpmdev=tpm0',
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
			aarch64: ['-M', 'virt', '-cpu', 'cortex-a72'],
		};
		const networkArgs = [
			'-net',
			`nic,model=e1000,macaddr=${this.macaddr}`,
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
				`if=pflash,format=raw,unit=0,file=${
					this.qemuOptions.firmware!.code
				},readonly=on`,
				'-drive',
				`if=pflash,format=raw,unit=1,file=${
					this.runtimeFirmwareVars
				}`,
			],
			aarch64: ['-bios', this.qemuOptions.firmware!.code],
		};
		const qmpArgs = ['-qmp', `unix:/tmp/qmp.sock,server,wait=off`];
		let args = baseArgs
			.concat(options?.internalStorage ? internalStorageArgs : [])
			.concat(options?.externalStorage ? externalStorageArgs : [])
			.concat(this.qemuOptions.secureBoot ? tpmArgs : [])
			.concat(archArgs[deviceArch])
			.concat(networkArgs)
			.concat(firmwareArgs[deviceArch])
			.concat(qmpArgs);

		if (this.screenCapturer != null) {
			const gfxArgs = ['-vnc', `:${vncDisplay}`];
			args = args.concat(gfxArgs);
		}

		if (this.qemuOptions.secureBoot) {
			// Wait for swtpm to become available
			await new Promise<void>((resolve) => {
				const interval = setInterval(
					() => {
						if (fs.existsSync('/var/tpm0/swtpm.sock')) {
							clearInterval(interval);
							resolve();
						}
					},
					50
				);
			});
		}

		console.debug("QEMU args:\n", args);

		return new Promise((resolve, reject) => {
			let spawnOptions = {};
			if (this.qemuOptions.debug) {
				spawnOptions = { stdio: 'inherit' };
			} else {
				spawnOptions = { stdio: 'ignore' };
			}

			this.qemuProc = spawn(`qemu-system-${deviceArch}`, args, spawnOptions);

			if (options?.listeners?.onExit !== undefined) {
				this.qemuProc.once('exit', options!.listeners!.onExit!);
			}

			this.qemuProc.on('exit', (code) => {
				reject(new Error(`QEMU exited with code ${code}`));
			});
			this.qemuProc.on('error', (err) => {
				reject(err);
			});

			// Flasher images that install into internal disk will shutdown by themselves
			// Flasher images that install into the booting disk will reboot so we need to
			// power off the QEMU device so the flashing completes
			if ( options?.exitOnReset && this.qemuProc != null && !this.qemuProc!.killed ) {
				const protocol = qmpArgs[1].substring(0,qmpArgs[1].indexOf(':'));
				const ipc = qmpArgs[1].substring(qmpArgs[1].indexOf(':') + 1,qmpArgs[1].indexOf(','));
				const timeoutinSecs = 10

				if ( protocol === 'unix') {
					this.assertFileExists(ipc, timeoutinSecs * 1000).then( () => {
							return this.killOnReset(ipc)
					})
				} else {
					console.log(`Unknown protocol ${protocol}`);
				}
			}
			resolve();
		}
	)}

	public async on(): Promise<void> {
		return this.runQEMU(
			{
				internalStorage: this.qemuOptions.internalStorage,
				externalStorage: this.qemuOptions.externalStorage
			});
	}

	public async off(): Promise<void> {
		return new Promise((resolve) => {
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
		return new Promise((resolve) => {
			spawn('brctl', ['show', bridgeName]).on('exit', (code) => {
				if (code === 0) {
					resolve();
				} else {
					resolve(this.createBridge(bridgeName, bridgeAddress));
				}
			});
		});
	}

	public async network(): Promise<void> {
		/* Network configuration, including creating a bridge, setting iptables
		 * rules, and running a DHCP server, requires privileges. This can all be
		 * done easily in a container, but would otherwise necessitate running the
		 * whole test suite privileged, or with CAP_NET_ADMIN.
		 *
		 * Allow users to disable network autoconfiguration in favor of manually
		 * setting up a bridge and DHCP server separately.
		 */
		if (this.qemuOptions.network.autoconfigure) {
			if (this.qemuOptions.network.bridgeName === null) {
				this.bridgeName = `br${this.id}`;
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
				this.bridgeAddress = this.qemuOptions.network.bridgeAddress as string;
				if (this.qemuOptions.network.dhcpRange === null) {
					throw new Error(
						'If manually providing a bridge address, must also specify a DHCP range!',
					);
				} else {
					this.dhcpRange = this.qemuOptions.network.dhcpRange as string;
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

					this.dnsmasqProc.on('exit', (code) => {
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
		} else {
			if (this.qemuOptions.network.bridgeName) {
				this.bridgeName = this.qemuOptions.network.bridgeName;
			} else {
				throw new Error('Bridge name is required when autoconfiguration is disabled');
			}
		}
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
