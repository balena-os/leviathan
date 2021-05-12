import { EventEmitter } from 'events';
import { StatusCodeError } from 'request-promise/errors';
import { Readable } from 'stream';

declare global {
	interface Dictionary<T> {
		[key: string]: T;
	}
	namespace Leviathan {
		interface RuntimeConfiguration {
			workdir: string;
			workerType: string;
			screenCapture: boolean;
			network: Leviathan.Options.network;
		}
		interface WorkerState {
			network: { wired?: string; wireless?: string };
		}

		interface Worker extends EventEmitter {
			readonly state: WorkerState;

			/** Flash the attached drive (for example, with an OS image). */
			flash(stream: Stream.Readable): Promise<void>;
			/** Power on DUT. */
			powerOn(): Promise<void>;
			/** Power off DUT. */
			powerOff(): Promise<void>;
			setup(): Promise<void>;
			teardown(signal?: NodeJS.Signals): Promise<void>;
			/** Set up the specified network environment. */
			network(configuration): Promise<void>;
			/** Control HDMI capture process. */
			captureScreen(action: 'start' | 'stop'): Promise<void | Readable>;
		}

		interface Options {
			worker: {
				disk?: string;
				workdir: string;
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
			//screen?: { VNC: { host: string; port: string }; HDMI: { dev: number } };
			screen?: { VNC: { host: string; port: string }; HDMI: { dev: number } } | boolean;
		}
	}
}
