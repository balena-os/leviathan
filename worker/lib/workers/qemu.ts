import * as Bluebird from 'bluebird';
import * as retry from 'bluebird-retry';
import { ChildProcess, spawn } from 'child_process';
import * as sdk from 'etcher-sdk';
import { EventEmitter } from 'events';
import { assignIn } from 'lodash';
import { fs } from 'mz';
import { dirname, join } from 'path';
import * as Stream from 'stream';
import { manageHandlers } from '../helpers';
import ScreenCapture from '../helpers/graphics';

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

		this.signalHandler = this.teardown.bind(this);
	}

	public get state() {
		return this.internalState;
	}

	public async setup(): Promise<void> {
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
			const qemuImgProc = spawn(
				'qemu-img',
				['resize', '-f', 'raw', this.image, '8G']
			);

			qemuImgProc.on(
				'error', (err) => {
					reject(err);
				}
			);

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
		let qmpArgs = ['-qmp', 'tcp:localhost:4444,server,nowait'];
		let args = baseArgs.concat(
			archArgs[deviceArch]).concat(
			networkArgs).concat(
			firmwareArgs[deviceArch]).concat(
			qmpArgs);

		if (this.screenCapturer != null) {
			let gfxArgs = [
				'-vnc', ':0',
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
				!this.qemuProc.on('exit', resolve)
				this.qemuProc.kill();
			} else {
				resolve();
			}
		});
	}

	private async createBridge(bridgeName: string, bridgeAddress: string): Promise<void> {
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
			return new Promise((resolve, reject) => {
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

	private async setupBridge(bridgeName: string, bridgeAddress: string): Promise<void> {
		return new Promise((resolve, reject) => {
			spawn('brctl', ['show', bridgeName]).on('exit', (code) => {
				if (code == 0) {
					resolve();
				} else {
					return this.createBridge(bridgeName, bridgeAddress);
				}
			});
		});
	}

	public async network(configuration: {
		wired?: { nat: boolean };
	}): Promise<void> {
    const bridgeName: string = this.qemuOptions.network.bridgeName;
    const bridgeAddress: string = this.qemuOptions.network.bridgeAddress;
    const dnsmasqArgs = [
      `--interface=${bridgeName}`,
      `--dhcp-range=${this.qemuOptions.network.dhcpRange}`,
      '--conf-file',
      '--bind-interfaces',
      '--no-daemon',
      `--dhcp-leasefile=/var/run/qemu-dnsmasq-${bridgeName}.leases`,
    ];

		return this.setupBridge(bridgeName, bridgeAddress).then(() => {
			return new Promise((resolve, reject) => {
				if (this.dnsmasqProc && !this.dnsmasqProc.killed) {
					// dnsmasq is already running
					resolve();
				} else {

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
				}
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
