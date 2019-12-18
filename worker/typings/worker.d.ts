import { EventEmitter } from 'events';
import { StatusCodeError } from 'request-promise/errors';
import { Readable } from 'stream';

declare global {
	namespace Leviathan {
		interface WorkerState {
			network: { wired?: string; wireless?: string };
		}
		interface Worker extends EventEmitter {
			readonly state: WorkerState;

			flash(stream: Stream.Readable): Promise<void>;
			powerOn(): Promise<void>;
			powerOff(): Promise<void>;
			setup(): Promise<void>;
			teardown(signal?: NodeJS.Signals): Promise<void>;
			network(configuration): Promise<void>;
			captureScreen(action: 'start' | 'stop'): Promise<void | Readable>;
		}

		interface Options {
			worker: {
				disk?: string;
				workdir: string;
				serialPort?: string;
			};
			network?:
				| {
						wireless: string;
						wired?: string;
				  }
				| {
						wireless?: string;
						wired: string;
				  };
			screen?: { VNC: { host: string; port: string }; HDMI: { dev: number } };
		}
	}
}
