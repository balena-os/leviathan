import { EventEmitter } from 'events';
import { StatusCodeError } from 'request-promise/errors';
import { Readable } from 'stream';

interface Contract {
	uuid: string | undefined;
	workerType: string | undefined;
	supportedFeatures: { [key: string]: boolean | string };
}

declare global {
	interface Dictionary<T> {
		[key: string]: T;
	}
	namespace Leviathan {
		interface WorkerState {
			network: { wired?: string; wireless?: string };
		}

		interface QemuOptions {
			architecture: string;
			cpus: string;
			memory: string;
			debug: boolean;
			firmware?: {
				code: string,
				vars: string
			},
			network: {
				bridgeName: string;
				bridgeAddress: string;
				dhcpRange: string;
				vncPort: number;
				qmpPort: number;
				vncMinPort: number;
				vncMaxPort: number;
				qmpMinPort: number;
				qmpMaxPort: number;
			}
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
			/** Returns relevant information about the worker to be used in tests */
			diagnostics(): any;
		}

		interface RuntimeConfiguration {
			worker: {
				disk?: string;
				workdir: string;
				deviceType: string;
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
			screenCapture?: boolean;
			qemu?: QemuOptions;
		}
	}
}
