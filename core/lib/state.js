const { fs } = require('mz');

const redPath = '/sys/class/leds/pca963x:red/brightness';
const greenPath = '/sys/class/leds/pca963x:green/brightness';
const bluePath = '/sys/class/leds/pca963x:blue/brightness';

const brightness = parseFloat(process.env.STATE_LED_BRIGHTNESS || '0.2');
const maxBrightness = 255;

const colors = {
	red: [1, 0, 0],
	yellow: [1, 1, 0],
	purple: [1, 0, 1],
	green: [0, 1, 0],
	cyan: [0, 1, 1],
	white: [1, 1, 1],
	blue: [0, 0, 1],
	black: [0, 0, 0],
};

class BalenaFinLed {
	constructor() {
		this.init = this.reset();
	}

	safeWrite(path, value) {
		return fs.writeFile(path, value).catch(e => {});
	}

	async color(color) {
		await this.init;
		if (color in colors) {
			await this.reset();

			await Promise.all([
				this.safeWrite(
					redPath,
					Math.round(colors[color][0] * maxBrightness * brightness),
				),
				this.safeWrite(
					greenPath,
					Math.round(colors[color][1] * maxBrightness * brightness),
				),
				this.safeWrite(
					bluePath,
					Math.round(colors[color][2] * maxBrightness * brightness),
				),
			]);
		} else {
			throw new Error(`The requested color: ${color} is not supported.`);
		}
	}

	async reset() {
		await Promise.all([
			this.safeWrite(redPath, 0),
			this.safeWrite(greenPath, 0),
			this.safeWrite(bluePath, 0),
		]);
	}
}

const finLed = new BalenaFinLed();

const States = {
	IDLE: 'white',
	SUCCESS: 'green',
	FAILED: 'red',
	BUSY: 'blue',
};

const IDLE_TIMEOUT_MS = 5 * 30 * 1000; // 5 minutes

module.exports = class MachineState {
	constructor() {
		this.idle();
		this.idleTimer = null;
	}

	update(state) {
		if (this.state !== state) {
			this.state = state;
			finLed.color(state);
		}
		if (this.idleTimer != null) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}

	idle() {
		this.update(States.IDLE);
	}

	success() {
		this.update(States.SUCCESS);
		this.idleTimer = setTimeout(() => this.idle(), IDLE_TIMEOUT_MS);
	}

	failed() {
		this.update(States.FAILED);
		this.idleTimer = setTimeout(() => this.idle(), IDLE_TIMEOUT_MS);
	}

	busy() {
		this.update(States.BUSY);
	}

	isBusy() {
		return this.state === States.BUSY;
	}

	// Get current state of worker from LED color
	getState() {
		var ret = {};
		for (var key in States) {
			ret[States[key]] = key;
		}
		return ret[this.state];
	}
};
