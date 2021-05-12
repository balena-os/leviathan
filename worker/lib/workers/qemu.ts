import * as Bluebird from 'bluebird';
import * as retry from 'bluebird-retry';
import { ChildProcess, spawn } from 'child_process';
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

	constructor(options: Leviathan.Options) {
		super();

		if (options != null) {
			this.image =
				options.worker != null && options.worker.disk != null
					? options.worker.disk
					: '/data/os.img';

			/*if (options.screen != null) {
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
			}*/
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

	private getNetworkConf({ id, nat }: { id: string; nat: boolean }): string {
		const conf: xml.Element = {
			elements: [
				{
					type: 'element',
					name: 'network',
					elements: [
						{
							type: 'element',
							name: 'name',
							elements: [{ type: 'text', text: id }],
						},
						{
							type: 'element',
							name: 'domain',
							attributes: { name: id },
						},

						{
							type: 'element',
							name: 'ip',
							attributes: {
								address: '192.168.100.1',
								netmask: '255.255.255.0',
							},
							elements: [
								{
									type: 'element',
									name: 'dhcp',
									elements: [
										{
											type: 'element',
											name: 'range',
											attributes: {
												start: '192.168.100.128',
												end: '192.168.100.254',
											},
										},
									],
								},
							],
						},
					],
				},
			],
		};

		// Even if our conf is constant, let s satisfy the types requirments
		if (
			nat != null &&
			nat &&
			conf.elements != null &&
			conf.elements[0].elements != null
		) {
			conf.elements[0].elements.push({
				type: 'element',
				name: 'forward',
				attributes: { mode: 'nat' },
			});
		}

		return xml.js2xml(conf);
	}

	private async getDomainConf({ id }: { id: string }): Promise<string> {
		const conf: xml.Element = {
			elements: [
				{
					type: 'element',
					name: 'domain',
					attributes: { type: 'kvm', id: '1' },
					elements: [
						{
							type: 'element',
							name: 'name',
							elements: [{ type: 'text', text: id }],
						},
						{
							type: 'element',
							name: 'memory',
							attributes: { unit: 'KiB' },
							elements: [{ type: 'text', text: '1048576' }],
						},
						{
							type: 'element',
							name: 'resource',
							elements: [
								{
									type: 'element',
									name: 'partition',
									elements: [{ type: 'text', text: '/machine' }],
								},
							],
						},
						{
							type: 'element',
							name: 'os',
							elements: [
								{
									type: 'element',
									name: 'type',
									attributes: { arch: 'x86_64', machine: 'pc' },
									elements: [{ type: 'text', text: 'hvm' }],
								},
								{ type: 'element', name: 'boot', attributes: { dev: 'hd' } },
							],
						},
						{
							type: 'element',
							name: 'on_reboot',
							elements: [{ type: 'text', text: 'restart' }],
						},
						{
							type: 'element',
							name: 'on_shutdown',
							elements: [{ type: 'text', text: 'shutdown' }],
						},
						{
							type: 'element',
							name: 'devices',
							elements: [
								{
									type: 'element',
									name: 'emulator',
									elements: [
										{ type: 'text', text: '/usr/bin/qemu-system-x86_64' },
									],
								},
								{
									type: 'element',
									name: 'disk',
									attributes: { type: 'file', device: 'disk' },
									elements: [
										{
											type: 'element',
											name: 'driver',
											attributes: { name: 'qemu', type: 'raw' },
										},
										{
											type: 'element',
											name: 'source',
											attributes: {
												file: this.image,
											},
										},
										{ type: 'element', name: 'backingStore' },
										{
											type: 'element',
											name: 'target',
											attributes: { dev: 'hda', bus: 'ide' },
										},
										{
											type: 'element',
											name: 'alias',
											attributes: { name: 'ide0-0-0' },
										},
										{
											type: 'element',
											name: 'address',
											attributes: {
												type: 'drive',
												controller: '0',
												bus: '0',
												target: '0',
												unit: '0',
											},
										},
									],
								},
							],
						},
					],
				},
			],
		};

		if (this.screenCapturer != null) {
			// The top level of the xml is one element called domain
			if (conf.elements != null && conf.elements[0].elements != null) {
				const devices =
					conf.elements[0].elements[
						conf.elements[0].elements.findIndex(element => {
							return element.name === 'devices';
						})
					];

				if (devices.elements != null) {
					devices.elements.push({
						type: 'element',
						name: 'graphics',
						attributes: {
							type: 'vnc',
							port: this.screenCapturer.source.options.port,
							listen: this.screenCapturer.source.options.host,
						},
					});
				}
			}
		}

		if (
			this.references.network != null &&
			conf.elements != null &&
			conf.elements[0].elements != null
		) {
			const reference = conf.elements[0].elements.find(
				(element: xml.Element) => {
					return element.name === 'devices';
				},
			);

			if (reference != null && reference.elements != null) {
				reference.elements.push({
					type: 'element',
					name: 'interface',
					attributes: { type: 'network' },
					elements: [
						{
							type: 'element',
							name: 'mac',
							attributes: { address: '52:54:00:f5:ae:e9' },
						},
						{
							type: 'element',
							name: 'source',
							attributes: {
								network: await this.references.network.getNameAsync(),
								bridge: 'virbr0',
							},
						},
						{
							type: 'element',
							name: 'target',
							attributes: { dev: 'vnet0' },
						},
						{
							type: 'element',
							name: 'model',
							attributes: { type: 'e1000' },
						},
						{
							type: 'element',
							name: 'alias',
							attributes: { name: 'net0' },
						},
						{
							type: 'element',
							name: 'address',
							attributes: {
								type: 'pci',
								domain: '0x0000',
								bus: '0x00',
								slot: '0x03',
								function: '0x0',
							},
						},
					],
				});
			}
		}

		return xml.js2xml(conf);
	}

	private getStoragePoolConf({ id }: { id: string }): string {
		return xml.js2xml({
			elements: [
				{
					type: 'element',
					name: 'pool',
					attributes: { type: 'dir' },
					elements: [
						{
							type: 'element',
							name: 'name',
							elements: [{ type: 'text', text: id }],
						},
						{
							type: 'element',
							name: 'target',
							elements: [
								{
									type: 'element',
									name: 'path',
									elements: [{ type: 'text', text: dirname(this.image) }],
								},
							],
						},
					],
				},
			],
		});
	}

	public async setup(): Promise<void> {
		this.libvirtdProc = spawn('libvirtd', {
			stdio: 'ignore',
			env: assignIn(process.env, {
				DBUS_SYSTEM_BUS_ADDRESS: 'unix:path=/host/run/dbus/system_bus_socket',
			}),
		});
		this.virtlogdProc = spawn('virtlogd', {
			stdio: 'ignore',
			env: assignIn(process.env, {
				DBUS_SYSTEM_BUS_ADDRESS: 'unix:path=/host/run/dbus/system_bus_socket',
			}),
		});

		this.hypervisor = new libvirt.Hypervisor('qemu:///system');

		await retry(
			async () => {
				await fs.stat('/var/run/libvirt/libvirt-sock');
				await fs.stat('/var/run/libvirt/virtlogd-sock');
				await this.hypervisor.connectAsync();
			},
			{ throw_original: true, interval: 1000, max_tries: 30 },
		);

		this.references.pool = await this.hypervisor.createStoragePoolAsync(
			this.getStoragePoolConf({
				id: Qemu.generateId(),
			}),
		);

		manageHandlers(this.signalHandler, {
			register: true,
		});
	}

	public async teardown(signal?: NodeJS.Signals): Promise<void> {
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
			resolve();
		});

		await this.activeFlash;
		this.activeFlash = undefined;
	}

	public async powerOn(): Promise<void> {
		this.references.domain = await this.hypervisor.createDomainAsync(
			await this.getDomainConf({
				id: Qemu.generateId(),
			}),
		);
	}

	public async powerOff(): Promise<void> {
		if (this.references.domain != null) {
			await this.references.domain.destroyAsync();
			this.references.domain = undefined;
		}
	}

	public async network(configuration: {
		wired?: { nat: boolean };
	}): Promise<void> {
		if (configuration != null && configuration.wired != null) {
			this.references.network = await this.hypervisor.createNetworkAsync(
				this.getNetworkConf({
					id: Qemu.generateId(),
					nat: configuration.wired.nat,
				}),
			);
			this.internalState.network = {
				wired: await this.references.network.getBridgeNameAsync(),
			};
		} else if (this.references.network.wired != null) {
			await this.references.network.destroyAsync();
			this.references.network = undefined;
			this.internalState.network.wired = undefined;
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

export default Qemu;
