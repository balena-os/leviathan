import * as Bluebird from 'bluebird';
import * as retry from 'bluebird-retry';
import { exec,ChildProcess, spawn } from 'child_process';
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

Bluebird.config({
	cancellation: true,
});

class Qemu extends EventEmitter implements Leviathan.Worker {
	private image: string;
	private hypervisor: any;
	private libvirtdProc?: ChildProcess;
	private virtlogdProc?: ChildProcess;
	private activeFlash?: Bluebird<void>;
	private signalHandler: (signal: NodeJS.Signals) => Promise<void>;
	private references: { domain?: any; network?: any; pool?: any };
	private internalState: Leviathan.WorkerState = { network: {} };
	private screenCapturer: ScreenCapture;
	private qemuProc?: ChildProcess;


	constructor(options: Leviathan.Options) {
		super();

		if (options != null) {
			this.image =
				options.worker != null && options.worker.disk != null
					? options.worker.disk
					: '/data/os.img';

			if (options.screen != null) {
				this.screenCapturer = new ScreenCapture(
					{
						type: 'rfbsrc',
						options: {
							host:
								options.screen.VNC != null
									? options.screen.VNC.host
									: '127.0.0.1',
							port:
								options.screen.VNC != null ? options.screen.VNC.port : '5900',
						},
					},
					join(options.worker.workdir, 'capture'),
				);
			}
		}

		this.references = {};

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
		manageHandlers(this.signalHandler, {
			register: true,
		});
	}

	public async teardown(signal?: NodeJS.Signals): Promise<void> {
		this.qemuProc?.kill()
		
		if (this.screenCapturer != null) {
			await this.screenCapturer.teardown();
		}

		if (this.activeFlash != null) {
			this.activeFlash.cancel();
		}

		if (this.references.domain != null) {
			await this.references.domain.destroyAsync();
			this.references.domain = undefined;
		}

		if (this.references.network != null) {
			await this.references.network.destroyAsync();
			this.references.network = undefined;
		}

		if (signal != null) {
			if (signal === 'SIGTERM' || signal === 'SIGINT') {
				if (this.references.pool != null) {
					await this.references.pool.stopAsync();
					this.references.pool = undefined;
				}

				if (this.hypervisor != null) {
					await this.hypervisor.disconnectAsync();
					this.hypervisor = undefined;
				}

				if (this.libvirtdProc != null) {
					this.libvirtdProc.kill();
					this.libvirtdProc = undefined;
				}

				if (this.virtlogdProc != null) {
					this.virtlogdProc.kill();
					this.virtlogdProc = undefined;
				}
			}

			process.kill(process.pid, signal);
		}

		manageHandlers(this.signalHandler, {
			register: false,
		});
	}

	public async flash(stream: Stream.Readable): Promise<void> {
		await Bluebird.resolve()
	}

	public async powerOn(): Promise<void> {
		this.qemuProc = exec(`qemu-system-x86_64 -drive file=/data/os.img,media=disk,cache=none,format=raw -net nic,model=virtio -net user,hostfwd=tcp::60022-:22 -m 512 -nographic -machine type=pc,accel=kvm -smp 4 -cpu host`)
	}

	public async powerOff(): Promise<void> {
		this.qemuProc?.kill()
	}

	public async network(configuration: {
		wired?: { nat: boolean };
	}): Promise<void> {
		await Bluebird.resolve()
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

export default Qemu;
