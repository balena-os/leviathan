import * as _ from 'lodash';
import * as Emitter from 'events';
import { Pins } from 'firmata';

export enum ARDUINO {
	START_SYSEX = 0xf0,
	END_SYSEX = 0xf7,
	CAPABILITY_RESPONSE = 0x6c,
}

export class TransportStub extends Emitter {
	private recorded: Buffer[] = [];

	constructor() {
		super();
	}

	public write(buffer: Buffer): void {
		this.recorded.push(buffer);
		this.emit('write', buffer);
	}

	public record(): number[] {
		return Array.from(Buffer.concat(this.recorded));
	}
}

export function comparePinStates(a: Pins[] | undefined, b: Pins[] | undefined) {
	const difference: Array<{ index: number; pin: Pins }> = [];

	if (a != null && b != null) {
		if (a.length !== b.length) {
			throw new Error('Length mismatch');
		}

		a.forEach((element, i) => {
			if (!_.isEqual(element, b[i])) {
				difference.push({
					index: i,
					pin: element,
				});
			}
		});
	}

	return difference;
}
