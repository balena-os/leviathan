import * as Bluebird from 'bluebird';
import * as retry from 'bluebird-retry';
import * as sdk from 'etcher-sdk';
import { EventEmitter } from 'events';
import * as Board from 'firmata';
import * as Stream from 'stream';
import { fs } from 'mz';

import { getDrive, exec, manageHandlers } from '../helpers';
import NetworkManager, { Supported } from './nm';

Bluebird.config({
  cancellation: true
});

/**
 * TestBot Hardware config
 */
const HW_SERIAL5: Board.SERIAL_PORT_ID = 5;
const BAUD_RATE = 9600;
const DEV_SD = '/dev/disk/by-id/usb-PTX_sdmux_HS-SD_MMC_1234-0:0';
const DEV_TESTBOT = '/dev/ttyACM0';

enum GPIO {
  WRITE_DAC_REG = 0x00,
  ENABLE_VOUT_SW = 0x03,
  DISABLE_VOUT_SW = 0x04,
  ENABLE_VREG = 0x07,
  ENABLE_FAULTRST = 0x10,
  SD_RESET_ENABLE = 0x12,
  SD_RESET_DISABLE = 0x13
}

enum PINS {
  LED_PIN = 13,
  SD_MUX_SEL_PIN = 28,
  USB_MUX_SEL_PIN = 29
}

class TestBot extends EventEmitter implements Leviathan.Worker {
  private board: Board;
  private net?: NetworkManager;
  private disk?: string;
  private activeFlash?: Bluebird<void>;
  private signalHandler: (signal: NodeJS.Signals) => Promise<void>;
  internalState: Leviathan.WorkerState = { network: {} };

  /**
   * Represents a TestBot
   */
  constructor(options: Leviathan.Options) {
    super();

    if (options != null && options.network != null) {
      this.net = new NetworkManager(options.network);
    }

    if (options != null && options.worker != null && options.worker.disk != null) {
      this.disk = options.worker.disk;
    }

    if (process.platform != 'linux' && this.disk == null) {
      throw new Error(
        'We cannot automatically detect the testbot interface, please provide it manually'
      );
    }

    this.signalHandler = this.teardown.bind(this);
  }

  get state() {
    return this.internalState;
  }

  static async flashFirmware() {
    const UNCONFIGURED_USB = '/dev/disk/by-id/usb-Generic_Ultra_HS-SD_MMC_000008264001-0:0';

    try {
      await fs.readlink(DEV_SD);
    } catch (_err) {
      // Flash sketch to expose the SD interface
      await retry(
        () => {
          return exec(
            'teensy_loader_cli',
            ['-v', '-s', '-mmcu=mk66fx1m0', 'SDcardSwitch.ino.hex'],
            './firmware'
          );
        },
        { interval: 1000, max_tries: 10, throw_original: true }
      );
      // Allow for the sketch to run
      await Bluebird.delay(15000);
      await exec('udevadm', ['settle'], '.');
      await exec(
        'usbsdmux-configure',
        [
          await retry(() => fs.readlink(UNCONFIGURED_USB), {
            interval: 1000,
            max_tries: 10,
            throw_original: true
          }),
          '1234'
        ],
        '.'
      );
    } finally {
      // Flash firmata
      await retry(
        () => {
          return exec(
            'teensy_loader_cli',
            ['-v', '-s', '-mmcu=mk66fx1m0', 'StandardFirmataPlus.ino.hex'],
            './firmware'
          );
        },
        { interval: 1000, max_tries: 10, throw_original: true }
      );

      await Bluebird.delay(1000);
    }
  }

  /**
   * Get dev interface of the SD card
   */
  private getDevInterface(
    timeout: retry.Options = { max_tries: 5, interval: 5000 }
  ): Bluebird<string> {
    return retry(
      () => {
        return fs.realpath(DEV_SD);
      },
      { ...timeout, throw_original: true }
    );
  }

  /**
   * Send an array of bytes over the selected serial port
   */
  private async sendCommand(
    command: number,
    settle: number = 0,
    a: number = 0,
    b: number = 0
  ): Promise<void> {
    this.board.serialWrite(HW_SERIAL5, [command, a, b]);
    await Bluebird.delay(settle);
  }

  /**
   * Reset SD card controller
   */
  private async resetSdCard(): Promise<void> {
    await this.sendCommand(GPIO.SD_RESET_ENABLE, 10);
    await this.sendCommand(GPIO.SD_RESET_DISABLE);
  }

  /**
   * Connected the SD card interface to DUT
   */
  private async switchSdToDUT(settle: number = 0): Promise<void> {
    console.log('Switching SD card to device...');
    await this.resetSdCard();
    this.board.digitalWrite(PINS.LED_PIN, this.board.LOW);
    this.board.digitalWrite(PINS.SD_MUX_SEL_PIN, this.board.LOW);

    await Bluebird.delay(settle);
  }

  /**
   * Connected the SD card interface to the host
   *
   */
  private async switchSdToHost(settle: number = 0): Promise<void> {
    console.log('Switching SD card to host...');
    await this.resetSdCard();
    this.board.digitalWrite(PINS.LED_PIN, this.board.HIGH);
    this.board.digitalWrite(PINS.SD_MUX_SEL_PIN, this.board.HIGH);

    await Bluebird.delay(settle);
  }

  /**
   * Power on DUT
   */

  private async powerOnDUT(): Promise<void> {
    console.log('Switching testbot on...');
    await this.sendCommand(GPIO.ENABLE_VOUT_SW, 500);
  }

  /**
   * Power off DUT
   */
  private async powerOffDUT(): Promise<void> {
    console.log('Switching testbot off...');
    await this.sendCommand(GPIO.DISABLE_VOUT_SW, 500);
  }

  /**
   * Flash SD card with operating system
   */
  public async flash(stream: Stream.Readable): Promise<void> {
    this.activeFlash = new Bluebird(async (resolve, reject) => {
      await this.powerOff();

      const source = new sdk.sourceDestination.SingleUseStreamSource(stream);
      // For linux, udev will provide us with a nice id for the testbot
      const drive = await getDrive(await this.getDevInterface());

      await sdk.multiWrite.pipeSourceToDestinations(
        source,
        [drive],
        (_destination, error) => {
          reject(error);
        },
        (progress: sdk.multiWrite.MultiDestinationProgress) => {
          this.emit('progress', progress);
        },
        true
      );

      resolve();
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
  public async network(configuration: Supported['configuration']): Promise<void> {
    if (this.net == null) {
      throw new Error('Network not configured on this worker. Ignoring...');
    }

    if (configuration.wireless != null) {
      this.internalState.network = {
        wireless: await this.net.addWirelessConnection(configuration.wireless)
      };
    } else {
      await this.net.removeWirelessConnection();
      this.internalState.network.wireless = undefined;
    }

    if (configuration.wired != null) {
      this.internalState.network = {
        wired: await this.net.addWiredConnection(configuration.wired)
      };
    } else {
      await this.net.removeWiredConnection();
      this.internalState.network.wired = undefined;
    }
  }

  /**
   * Setup testbot
   */
  public async setup(): Promise<void> {
    manageHandlers(this.teardown, {
      register: true
    });

    if (process.env.CI == null) {
      await TestBot.flashFirmware();
    }

    await new Promise((resolve, reject) => {
      this.board = new Board(DEV_TESTBOT);
      this.board.once('error', reject);
      this.board.serialConfig({
        portId: HW_SERIAL5,
        baud: BAUD_RATE
      });
      this.board.once('ready', async () => {
        // Power managment configuration
        // We set the regulator (DAC_REG) to 5V and start the managment unit (VREG)
        await this.sendCommand(GPIO.ENABLE_FAULTRST, 1000);
        this.board.pinMode(PINS.LED_PIN, this.board.MODES.OUTPUT);
        await this.sendCommand(GPIO.WRITE_DAC_REG, 1000, 5);
        await this.sendCommand(GPIO.ENABLE_VREG, 1000);

        // SD card managment configuration
        // We enable the SD/USB multiplexers and leave them disconnected
        this.board.pinMode(PINS.SD_MUX_SEL_PIN, this.board.MODES.OUTPUT);
        this.board.digitalWrite(PINS.SD_MUX_SEL_PIN, this.board.LOW);
        this.board.pinMode(PINS.USB_MUX_SEL_PIN, this.board.MODES.OUTPUT);
        this.board.digitalWrite(PINS.USB_MUX_SEL_PIN, this.board.LOW);

        await Bluebird.delay(1000);
        console.log('Worker ready');

        resolve();
      });
    });
  }

  /**
   * Teardown testbot
   */
  public async teardown(signal?: NodeJS.Signals): Promise<void> {
    if (this.activeFlash != null) {
      this.activeFlash.cancel();
    }

    if (this.net != null) {
      await this.net.teardown();
    }

    // This property is missing from types definition, will open PR upstream
    if (this.board != null) {
      await this.powerOff();
      this.board.serialClose(HW_SERIAL5);
    }

    if (signal != null) {
      process.kill(process.pid, signal);
    }

    manageHandlers(this.teardown, {
      register: false
    });
  }
}

export default TestBot;
