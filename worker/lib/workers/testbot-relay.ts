import {
	TestBotHat,
} from '@balena/testbot';
import { EventEmitter } from 'events';
import { createWriteStream } from 'fs';
import { join } from 'path';
import * as Stream from 'stream';
import { manageHandlers } from '../helpers';
import ScreenCapture from '../helpers/graphics';
import NetworkManager, { Supported } from '../helpers/nm';
import { exec } from 'mz/child_process';
import * as Bluebird from 'bluebird';

// TODO: Consider moving network and screen capture logic to testbot SDK.

const dutSerialPath = '/reports/dut-serial.txt';

async function checkDutPower(){
    let [stdout, stderr] = await exec(`cat /sys/class/net/eth1/carrier`);
    let file = stdout.toString();
	console.log(`Number found is: ${file}end`)
	console.log(typeof(file))
    if (file.includes('1')){
        console.log(`DUT is currently On`);
        return true
    } else {
        console.log(`DUT is currently Off`)
        return false
    }
}

async function waitInternalFlash() {
    // check if the DUT is on first 
    let dutOn = false;
    while(!dutOn){
        console.log(`waiting for DUT to be on`)
        dutOn = await checkDutPower();
        await Bluebird.delay(1000 * 5) // 5 seconds between checks
    }
    // once we confirmed the DUT is on, we wait for it to power down again, which signals the flashing has finished
    while(dutOn){
        console.log(`waiting for DUT to be off`)
        dutOn = await checkDutPower();
        await Bluebird.delay(1000 * 60) // 60 seconds between checks ( is it enough ) 
    }

    // once the DUT is powered off again, we are done flashing (in theory) - not true, we need a window of time to wait, to confirm its actually a full power off

}


/** Worker implementation based on testbot. */
class TestBotRelay extends EventEmitter implements Leviathan.Worker {
	private internalState: Leviathan.WorkerState = { network: {} };
	private readonly networkCtl?: NetworkManager;
	private readonly screenCapturer?: ScreenCapture;

	private readonly hatBoard: TestBotHat;
	private dutLogStream: Stream.Writable | null = null;

	constructor(options: Leviathan.Options) {
		super();

		this.hatBoard = new TestBotHat();

		if (options != null) {
			if (options.network != null) {
				this.networkCtl = new NetworkManager(options.network);
			}

			if (options.screenCapture === true) {
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

	private async relayOn() {
		//await exec(`echo 1 >/sys/class/gpio/gpio${relayPin}/value`);
		await this.hatBoard.powerOnDUT();
	}
	
	private async relayOff() {
		//await exec(`echo 0 >/sys/class/gpio/gpio${relayPin}/value`);
		await this.hatBoard.powerOffDUT();
	}

	public async diagnostics() {
		return {
			// Add diagnostics information to be qeuried as needed
		}
	}

	public async setup() {
		await this.hatBoard.setup();
        
        // set up the relay GPIO
        //await exec(`echo ${relayPin} >/sys/class/gpio/export`);
        //await exec(`echo out >/sys/class/gpio/gpio${relayPin}/direction`);
        //console.log(`Set up power control on pin ${relayPin}...`)
	}

	public async flash(stream: Stream.Readable) { // this changes depending on the type of DUT
		console.log('Start flashing...');
        // always flash the SD card
		await this.hatBoard.flash(stream) // leaves SD mux toggled to host

        // if its a flasher image (e.g nuc, beaglebon), you have to do more
        if (process.env.PROVISION_TYPE === `flasher`){
            // toggle the sd mux to the DUT
			await this.relayOff();
            await this.hatBoard.switchSdToDUT(1000);

			await Bluebird.delay(1000 * 10)

            // power on the DUT
            // temp - just toggle via command line
            await this.relayOn();

            // now we need to wait until internal flashing has completed
            await waitInternalFlash();

            // now flashing is done, we need to remove power 
            await this.relayOff();

            // we must also toggle the SD mux back to the host
            await this.hatBoard.switchSdToHost(1000);

			// wait here to give the DUT time to be fully off, before we continue. If the DUT is toggled off then on too fast it may not power back on
			await Bluebird.delay(1000 * 10)
        }

        console.log('Flashing completed.');
	}

	public async powerOn() {
		const dutLog = await this.hatBoard.openDutSerial();
		if (dutLog) {
			this.dutLogStream = createWriteStream(dutSerialPath);
			dutLog.pipe(this.dutLogStream);
		}
		console.log('Powering on DUT...');
		await this.relayOn();
        console.log('DUT powered on!');
	}

	public async powerOff() {
		console.log('Powering off DUT...');
		await this.relayOff();
		this.dutLogStream?.end();
        console.log('DUT powered off!');
	}

	public async network(configuration: Supported['configuration']) {
		console.log('Start network setup');
		if (this.networkCtl == null) {
			throw new Error('Network not configured on this worker. Ignoring...');
		}

		if (configuration.wireless != null) {
			console.log('Adding wireless connection...');
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
			console.log('Adding wired connection...');
			this.internalState.network = {
				wired: await this.networkCtl.addWiredConnection(configuration.wired),
			};
		} else {
			await this.networkCtl.teardowns.wired.run();
			this.internalState.network.wired = undefined;
		}
		console.log('Network setup completed');
	}

	public async captureScreen(
		action: 'start' | 'stop',
	): Promise<void | Stream.Readable> {
		if (this.screenCapturer == null) {
			throw new Error('Screen capture not configured');
		}

		switch (action) {
			case 'start':
				return await this.screenCapturer.startCapture();
			case 'stop':
				return await this.screenCapturer.stopCapture();
		}
	}

	public async teardown(signal?: NodeJS.Signals): Promise<void> {
		console.log('Performing teardown...');
		try {
			manageHandlers(this.teardown, {
				register: false,
			});

			await this.hatBoard.teardown(signal === 'SIGTERM' || signal === 'SIGINT');

			if (this.screenCapturer != null) {
				await this.screenCapturer.teardown();
			}

			if (this.networkCtl != null) {
				await this.networkCtl.teardown();
			}
		} finally {
			if (signal != null) {
				process.kill(process.pid, signal);
			}
		}
	}
}

export { TestBotRelay };
