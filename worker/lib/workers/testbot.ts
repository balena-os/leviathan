import * as Bluebird from 'bluebird';
import * as retry from 'bluebird-retry';
import * as sdk from 'etcher-sdk';
import * as Board from 'firmata';
import { getDrive, exec, manageHandlers } from '../helpers';
import ScreenCapture from '../helpers/graphics';
import NetworkManager, { Supported } from './nm';
import { fs } from 'mz';
import { dirname, join } from 'path';
import * as Stream from 'stream';
import { merge } from 'lodash';

Bluebird.config({
	cancellation: true,
});

/**
 * TestBot Hardware config
 */

abstract class TestBot extends Board implements Leviathan.Worker {
	protected activeFlash?: Bluebird<void>;

	protected internalState: Leviathan.WorkerState = { network: {} };
	protected networkCtl?: NetworkManager;
	protected screenCapturer: ScreenCapture;

	protected abstract DEV_SD: string;

	constructor(options: Leviathan.Options) {
		super(options.worker.serialPort, { skipCapabilities: true });

		if (options != null) {
			if (options.network != null) {
				this.networkCtl = new NetworkManager(options.network);
			}

			if (options.screen != null) {
				this.screenCapturer = new ScreenCapture(
					{
						type: 'v4l2src',
					},
					join(options.worker.workdir, 'capture'),
				);
			}
		}
	}

	get state() {
		return this.internalState;
	}

	/**
	 * Get dev interface of the SD card
	 */
	private getDevInterface(
		timeout: retry.Options = { max_tries: 5, interval: 5000 },
	): Bluebird<string> {
		return retry(
			() => {
				return fs.realpath(this.DEV_SD);
			},
			{ ...timeout, throw_original: true },
		);
	}

	/**
	 * Flash SD card with operating system
	 */
	public async flash(stream: Stream.Readable): Promise<void> {
		this.activeFlash = Bluebird.try(async () => {
			await this.switchSdToHost(5000);

			const source = new sdk.sourceDestination.SingleUseStreamSource(stream);

			// For linux, udev will provide us with a nice id for the testbot
			const drive = await getDrive(await this.getDevInterface());

			await sdk.multiWrite.pipeSourceToDestinations(
				source,
				[drive],
				(_destination, error) => {
					throw error;
				},
				(progress: sdk.multiWrite.MultiDestinationProgress) => {
					this.emit('progress', progress);
				},
				true,
			);
		});

		await this.activeFlash;
		this.activeFlash = undefined;
	}

	/**
	 * Turn on DUT
	 */
	public async powerOn(): Promise<void> {
		await this.switchSdToDUT(5000);
		await this.powerOnDUT();
	}

	/**
	 * Turn off DUT
	 */
	public async powerOff(): Promise<void> {
		await this.powerOffDUT();
		await this.switchSdToHost(5000);
	}
	/**
	 * Network Control
	 */
	public async network(
		configuration: Supported['configuration'],
	): Promise<void> {
		if (this.networkCtl == null) {
			throw new Error('Network not configured on this worker. Ignoring...');
		}

		if (configuration.wireless != null) {
			this.internalState.network = {
				wireless: await this.networkCtl.addWirelessConnection(
					configuration.wireless,
				),
			};
		} else {
			await this.networkCtl.teardowns.wireless.run();
			this.internalState.network.wireless = undefined;
		}

		if (configuration.wired != null) {
			this.internalState.network = {
				wired: await this.networkCtl.addWiredConnection(configuration.wired),
			};
		} else {
			await this.networkCtl.teardowns.wired.run();
			this.internalState.network.wired = undefined;
		}
	}

	/**
	 * Screen capture
	 */
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

	public async teardown(signal?: NodeJS.Signals): Promise<void> {
		try {
			manageHandlers(this.teardown, {
				register: false,
			});

			if (this.screenCapturer != null) {
				await this.screenCapturer.teardown();
			}

			if (this.activeFlash != null) {
				this.activeFlash.cancel();
			}

			if (this.networkCtl != null) {
				await this.networkCtl.teardown();
			}

			await this.powerOff();
		} finally {
			this.teardownBoard();

			if (signal != null) {
				process.kill(process.pid, signal);
			}
		}
	}

	abstract async setup(): Promise<void>;
	protected abstract async powerOffDUT(): Promise<void>;
	protected abstract async powerOnDUT(): Promise<void>;
	protected abstract async switchSdToDUT(delay: number): Promise<void>;
	protected abstract async switchSdToHost(delay: number): Promise<void>;
	protected abstract teardownBoard(): void;
}

class TestBotStandAlone extends TestBot implements Leviathan.Worker {
	private disk?: string;

	private static HW_SERIAL: Board.SERIAL_PORT_ID = 5;
	private static DEV_TESTBOT = '/dev/ttyACM0';
	private static BAUD_RATE = 9600;

	private static GPIOS = {
		WRITE_DAC_REG: 0x00,
		ENABLE_VOUT_SW: 0x03,
		DISABLE_VOUT_SW: 0x04,
		ENABLE_VREG: 0x07,
		ENABLE_FAULTRST: 0x10,
		SD_RESET_ENABLE: 0x12,
		SD_RESET_DISABLE: 0x13,
	};

	private static PINS = {
		LED_PIN: 13,
		SD_MUX_SEL_PIN: 28,
		USB_MUX_SEL_PIN: 29,
	};

	protected DEV_SD = '/dev/disk/by-id/usb-PTX_sdmux_HS-SD_MMC_1234-0:0';

	/**
	 * Represents a TestBot
	 */
	constructor(options: Leviathan.Options) {
		super(
			merge(options, { worker: { serialPort: TestBotStandAlone.DEV_TESTBOT } }),
		);

		if (options.worker != null && options.worker.disk != null) {
			this.disk = options.worker.disk;
		}

		if (process.platform != 'linux' && this.disk == null) {
			throw new Error(
				'We cannot automatically detect the testbot interface, please provide it manually',
			);
		}
	}

	/**
	 * Setup testbot
	 */
	public async setup(): Promise<void> {
		await this.flashFirmware();

		await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject('Firmata connection timed out');
			}, 60000);

			this.serialConfig({
				portId: TestBotStandAlone.HW_SERIAL,
				baud: TestBotStandAlone.BAUD_RATE,
			});

			this.once('error', error => {
				clearTimeout(timeout);
				reject(error);
			});

			const resolver = async () => {
				// Power managment configuration
				// We set the regulator (DAC_REG) to 5V and start the managment unit (VREG)
				await this.sendCommand(TestBotStandAlone.GPIOS.ENABLE_FAULTRST, 1000);
				this.pinMode(TestBotStandAlone.PINS.LED_PIN, this.MODES.OUTPUT);
				await this.sendCommand(TestBotStandAlone.GPIOS.WRITE_DAC_REG, 1000, 5);
				await this.sendCommand(TestBotStandAlone.GPIOS.ENABLE_VREG, 1000);

				// SD card managment configuration
				// We enable the SD/USB multiplexers and leave them disconnected
				this.pinMode(TestBotStandAlone.PINS.SD_MUX_SEL_PIN, this.MODES.OUTPUT);
				this.digitalWrite(TestBotStandAlone.PINS.SD_MUX_SEL_PIN, this.LOW);
				this.pinMode(TestBotStandAlone.PINS.USB_MUX_SEL_PIN, this.MODES.OUTPUT);
				this.digitalWrite(TestBotStandAlone.PINS.USB_MUX_SEL_PIN, this.LOW);

				await Bluebird.delay(1000);
				console.log('Worker ready');
				clearTimeout(timeout);

				resolve();
			};

			if (Object.keys(this.version).length === 0) {
				this.once('ready', resolver);
			} else {
				resolver();
			}
		});

		manageHandlers(this.teardown, {
			register: true,
		});
	}

	private async flashFirmware() {
		const UNCONFIGURED_USB =
			'/dev/disk/by-id/usb-Generic_Ultra_HS-SD_MMC_000008264001-0:0';

		try {
			await fs.readlink(this.DEV_SD);
		} catch (_err) {
			// Flash sketch to expose the SD interface
			await retry(
				() => {
					return exec(
						'teensy_loader_cli',
						['-v', '-s', '-mmcu=mk66fx1m0', 'SDcardSwitch.ino.hex'],
						'./firmware',
					);
				},
				{ interval: 1000, max_tries: 10, throw_original: true },
			);
			// Allow for the sketch to run
			await Bluebird.delay(15000);
			await exec('udevadm', ['settle'], '.');
			await exec(
				'usbsdmux-configure',
				[
					join(
						dirname(UNCONFIGURED_USB),
						await retry(() => fs.readlink(UNCONFIGURED_USB), {
							interval: 1000,
							max_tries: 10,
							throw_original: true,
						}),
					),
					'1234',
				],
				'.',
			);
		} finally {
			// Flash firmata
			await retry(
				() => {
					return exec(
						'teensy_loader_cli',
						['-v', '-s', '-mmcu=mk66fx1m0', 'StandardFirmataPlus.ino.hex'],
						'./firmware',
					);
				},
				{ interval: 1000, max_tries: 10, throw_original: true },
			);

			await Bluebird.delay(1000);
		}
	}

	/**
	 * Send an array of bytes over the selected serial port
	 */
	private async sendCommand(
		command: number,
		settle: number = 0,
		a: number = 0,
		b: number = 0,
	): Promise<void> {
		this.serialWrite(TestBotStandAlone.HW_SERIAL, [command, a, b]);
		await Bluebird.delay(settle);
	}

	/**
	 * Reset SD card controller
	 */
	private async resetHub(): Promise<void> {
		await this.sendCommand(TestBotStandAlone.GPIOS.SD_RESET_ENABLE, 10);
		await this.sendCommand(TestBotStandAlone.GPIOS.SD_RESET_DISABLE);
	}

	/**
	 * Connected the SD card interface to DUT
	 */
	protected async switchSdToDUT(settle: number = 0): Promise<void> {
		console.log('Switching SD card to device...');
		await this.resetHub();
		this.digitalWrite(TestBotStandAlone.PINS.LED_PIN, this.LOW);
		this.digitalWrite(TestBotStandAlone.PINS.SD_MUX_SEL_PIN, this.LOW);

		await Bluebird.delay(settle);
	}

	/**
	 * Connected the SD card interface to the host
	 *
	 */
	protected async switchSdToHost(settle: number = 0): Promise<void> {
		console.log('Switching SD card to host...');
		await this.resetHub();
		this.digitalWrite(TestBotStandAlone.PINS.LED_PIN, this.HIGH);
		this.digitalWrite(TestBotStandAlone.PINS.SD_MUX_SEL_PIN, this.HIGH);

		await Bluebird.delay(settle);
	}

	/**
	 * Power on DUT
	 */

	protected async powerOnDUT(): Promise<void> {
		console.log('Switching testbot on...');
		await this.sendCommand(TestBotStandAlone.GPIOS.ENABLE_VOUT_SW, 1000);
	}

	/**
	 * Power off DUT
	 */
	protected async powerOffDUT(): Promise<void> {
		console.log('Switching testbot off...');
		await this.sendCommand(TestBotStandAlone.GPIOS.DISABLE_VOUT_SW, 1000);
	}

	/**
	 * Teardown testbot
	 */
	protected teardownBoard() {
		this.serialClose(TestBotStandAlone.HW_SERIAL);
	}
}

class TestBotHat extends TestBot {
	private static DEV_TESTBOT = '/dev/ttyS0';

	private static PINS = {
		SD_RESET_N: 0,
		SD_MUX_SEL_PIN: 2,
		DUT_PW_EN: 14,
	};

	protected DEV_SD =
		'/dev/disk/by-id/usb-Generic_Ultra_HS-SD_MMC_000008264001-0:0';

	/**
	 * Represents a TestBot
	 */
	constructor(options: Leviathan.Options) {
		super(merge(options, { worker: { serialPort: TestBotHat.DEV_TESTBOT } }));
	}

	/**
	 * Setup testbot
	 */
	public async setup(): Promise<void> {
		await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject('Firmata connection timed out');
			}, 10000);

			const resolver = () => {
				console.log('Worker ready!');
				clearTimeout(timeout);
				resolve();
			};

			this.once('error', error => {
				clearTimeout(timeout);
				reject(error);
			});

			if (Object.keys(this.version).length === 0) {
				this.once('ready', resolver);
			} else {
				resolver();
			}
		});

		manageHandlers(this.teardown, {
			register: true,
		});
	}

	/**
	 * Reset SD card controller
	 */
	private resetHub() {
		this.digitalWrite(TestBotHat.PINS.SD_RESET_N, 0);
		this.digitalWrite(TestBotHat.PINS.SD_RESET_N, 1);
	}

	/**
	 * Connected the SD card interface to DUT
	 */
	protected async switchSdToDUT(settle: number = 0): Promise<void> {
		console.log('Switching SD card to device...');
		this.digitalWrite(TestBotHat.PINS.SD_MUX_SEL_PIN, this.LOW);
		this.resetHub();
		await Bluebird.delay(settle);
	}

	/**
	 * Connected the SD card interface to the host
	 *
	 */
	protected async switchSdToHost(settle: number = 0): Promise<void> {
		console.log('Switching SD card to host...');
		this.digitalWrite(TestBotHat.PINS.SD_MUX_SEL_PIN, this.HIGH);
		this.resetHub();
		await Bluebird.delay(settle);
	}

	/**
	 * Power on DUT
	 */

	protected async powerOnDUT(): Promise<void> {
		console.log('Switching testbot on...');
		this.digitalWrite(TestBotHat.PINS.DUT_PW_EN, this.HIGH);
	}

	/**
	 * Power off DUT
	 */
	protected async powerOffDUT(): Promise<void> {
		console.log('Switching testbot off...');
		this.digitalWrite(TestBotHat.PINS.DUT_PW_EN, this.LOW);
	}

	/**
	 * Teardown testbot
	 */
	protected teardownBoard() {
		this.transport.close();
	}
}

export { TestBotStandAlone, TestBotHat };
