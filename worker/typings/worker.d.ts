import { EventEmitter } from 'events';
import { StatusCodeError } from 'request-promise/errors';

declare global {
	namespace Leviathan {
		interface WorkerState {
			network: { wired?: string; wireless?: string };
		}
		interface Worker extends EventEmitter {
			private internalState: WorkerState;

			readonly state: WorkerState;

			flash(stream: Stream.Readable): Promise<void>;
			powerOn(): Promise<void>;
			powerOff(): Promise<void>;
			setup(): Promise<void>;
			teardown(signal?: NodeJS.Signals): Promise<void>;
			network(configuration): Promise<void>;
		}

		interface Options {
			worker: {
				disk?: string;
			};
			network?:
				| {
						apWifiIface: string;
						apWiredIface?: string;
				  }
				| {
						apWifiIface?: string;
						apWiredIface: string;
				  };
		}
	}
}
