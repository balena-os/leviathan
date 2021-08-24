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

	constructor(options: Leviathan.Options) {
		super();

		if (options != null) {
			this.image =
				options.worker != null && options.worker.disk != null
					? options.worker.disk
					: '/data/os.img';
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
		this.powerOff();

		manageHandlers(this.signalHandler, {
			register: false,
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
		let deviceArch = 'amd64';
		let baseArgs = [
			'-nographic',
			'-m', '2G',
			'-smp', '4',
			'-drive', 'format=raw,file=/data/os.img,if=virtio',
		];
		let archArgs: { [arch: string]: Array<string> } = {
			'amd64': [
				'-M', 'pc',
				'--enable-kvm',
				'-cpu', 'max'
			],
			'aarch64': [],
		};
		let networkArgs = ['-net', 'nic,model=e1000', '-net', 'bridge,br=br0'];
		let firmwareArgs: { [arch: string]: Array<string> } = {
			'amd64': ['-bios', '/usr/share/OVMF/OVMF_CODE.fd'],
			'aarch64': ['-bios', '/usr/share/qemu-efi-aarch64/QEMU_EFI.fd'],
		};
		let qmpArgs = ['-qmp', 'tcp:localhost:4444,server,nowait'];
		let args = baseArgs.concat(
			archArgs[deviceArch]).concat(
			networkArgs).concat(
			firmwareArgs[deviceArch]).concat(
			qmpArgs);
		const subprocess = spawn('qemu-system-x86_64', args);
		subprocess.on('spawn', () => {
			console.log("QEMU started");
			this.qemuProc = subprocess;
		});
		subprocess.on('exit', (code, signal) => {
			console.log(`QEMU exited with code ${code}`);
			this.qemuProc = null;
		});
		subprocess.on('error', (err) => {
			console.error('Failed to start qemu', err);
		});
	}

	public async powerOff(): Promise<void> {
		if (this.qemuProc && this.qemuProc.kill()) {
			this.qemuProc = null;
		}

		if (this.dnsmasqProc && this.dnsmasqProc.kill()) {
			this.dnsmasqProc = null;
		}
	}

	private async setupBridge(bridgeName: string, bridgeAddress: string): Promise<void> {
		console.log("Qemu: setupBridge()");
		spawn('brctl', ['show', 'br0']).on('exit', (code) => {
			if (code == 0) {
				console.log("Qemu: bridge already exists");
			} else {
				spawn('brctl', ['addbr', bridgeName]).on('exit', (code) => {
					if (code == 0) {
						console.log('Qemu: created bridge');
					} else {
						console.log('Qemu: failed to create bridge');
					}
				});
			}
		});

		spawn('ip', ['link', 'set', 'dev', bridgeName, 'up']).on('exit', (code) => {
			if (code != 0) {
				console.error(`Failed to bring ${bridgeName} up`);
			}
		});

		spawn('ip', ['addr', 'add', '192.168.100.1/24', 'dev', bridgeName]);
	}

	public async network(configuration: {
		wired?: { nat: boolean };
	}): Promise<void> {
		const bridgeName: string = 'br0';
		const bridgeAddress: string = '192.168.100.1';
		const ipRange: Array<string> = ['192.168.100.128', '192.168.100.254'];
		await this.setupBridge(bridgeName, bridgeAddress);
		const dnsmasqArgs = [`--interface=${bridgeName}`,
							 '--except-interface=lo',
							 '--bind-interfaces',
							 `--dhcp-range=${ipRange.join(',')}`,
							 '--conf-file',
							 `--pid-file=/var/run/qemu-dnsmasq-${bridgeName}.pid`,
							 `--dhcp-leasefile=/var/run/qemu-dnsmasq-${bridgeName}.leases`,
							 '--dhcp-no-override',
							 '--log-facility=/var/run/qemu-dnsmasq.log'
		];

		if (this.dnsmasqProc == null) {
			const subprocess = spawn(
				'dnsmasq', dnsmasqArgs, {stdio: 'inherit'});

			subprocess.on('spawn', () => {
				this.dnsmasqProc = subprocess;
			});

			subprocess.on('exit',
				(status, signal) => {
					if (status != 0) {
						throw new Error(`dnsmasq exited with status ${status}`);
					}

					this.dnsmasqProc = null;
				}
			);

			subprocess.on('error',
				(err) => {
					throw err;
				}
			);
		}
	}

	public async captureScreen(
		action: 'start' | 'stop',
	): Promise<void | Stream.Readable> {
	}
}

export default QemuWorker;
