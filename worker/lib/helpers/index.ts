import * as Bluebird from 'bluebird';
import { spawn } from 'child_process';
import * as config from 'config';
import * as sdk from 'etcher-sdk';
import { forEach, isEmpty, isObject } from 'lodash';
import * as mdns from 'multicast-dns';
import { networkInterfaces } from 'os';

function cleanObject(object: Dictionary<any>) {
	for (const key in object) {
		if (!object.hasOwnProperty(key)) {
			continue;
		}
		cleanObject(object[key]);

		if (
			object[key] == null ||
			(isObject(object[key]) && isEmpty(object[key]))
		) {
			delete object[key];
		}
	}
}

export async function getDrive(
	device: string,
): Promise<sdk.sourceDestination.BlockDevice> {
	// Do not include system drives in our search
	const adapter = new sdk.scanner.adapters.BlockDeviceAdapter(() => false);
	const scanner = new sdk.scanner.Scanner([adapter]);

	await scanner.start();

	let drive;

	try {
		drive = scanner.getBy('device', device);
	} finally {
		scanner.stop();
	}
	if (!(drive instanceof sdk.sourceDestination.BlockDevice)) {
		throw new Error(`Cannot find ${device}`);
	}

	return drive;
}

export function exec(
	command: string,
	args: string[],
	cwd: string,
): Bluebird<void> {
	return new Bluebird((resolve, reject) => {
		const proc = spawn(command, args, {
			cwd,
			stdio: 'inherit',
		});

		proc.on('error', error => {
			reject(
				new Error(
					command +
						' ' +
						args.join(' ') +
						' in ' +
						cwd +
						' encountered error ' +
						error.message,
				),
			);
		});

		proc.on('exit', function(code) {
			if (code !== 0) {
				reject(
					new Error(
						command +
							' ' +
							args.join(' ') +
							' in ' +
							cwd +
							' exited with code ' +
							code,
					),
				);
			} else {
				resolve();
			}
		});
	});
}

export async function manageHandlers(
	handler: (signal: NodeJS.Signals) => Promise<void>,
	options: { register: boolean },
): Promise<void> {
	for (const signal of ['SIGINT', 'SIGTERM'] as NodeJS.Signals[]) {
		if (options.register) {
			process.on(signal, handler);
		} else {
			process.removeListener(signal, handler);
		}
	}
}

export function getIpFromIface(iface: string): string {
	const ifaces = networkInterfaces();

	for (const dev in ifaces) {
		if (dev === iface) {
			for (const details of ifaces[dev]) {
				if (details.family === 'IPv4') {
					return details.address;
				}
			}
		}
	}

	throw new Error(`Could not find connected interface ${iface}`);
}

export function resolveLocalTarget(target: string): PromiseLike<string> {
	return new Bluebird((resolve, reject) => {
		if (/\.local$/.test(target)) {
			const sockets: any[] = [];

			for (const interfaces of Object.values(networkInterfaces())) {
				for (const ni of interfaces) {
					if (ni.family === 'IPv4') {
						sockets.push(mdns({ interface: ni.address }));
					}
				}
			}

			if (sockets.length === 0) {
				throw new Error('Did not find any network interfaces on this device');
			}

			function destroy(socks: any[]) {
				socks.forEach(sock => {
					sock.destroy();
				});
			}

			const timeout = setTimeout(() => {
				destroy(sockets);
				reject(new Error(`Could not resolve ${target}`));
			}, 4000);

			sockets.forEach(socket => {
				socket.on('error', () => {
					clearTimeout(timeout);
					destroy(sockets);
					reject();
				});
				socket.on('response', function(response: any) {
					const answer = response.answers.find(
						(x: any) => x.name === target && x.type === 'A',
					);

					if (answer != null) {
						clearTimeout(timeout);
						destroy(sockets);
						resolve(answer.data);
					}
				});

				socket.query([{ type: 'A', name: target }]);
			});
		} else {
			resolve(target);
		}
	});
}

export async function getRuntimeConfiguration(
	possibleWorkers: string[],
): Promise<Leviathan.RuntimeConfiguration> {
	const runtimeConfiguration: any = cleanObject(
		config.get('worker.runtimeConfiguration'),
	);

	if (!(runtimeConfiguration.workerType in possibleWorkers)) {
		throw new Error(
			`${runtimeConfiguration.workerType} is not a supported worker`,
		);
	}

	if (
		runtimeConfiguration.network == null ||
		(runtimeConfiguration.network.wired == null &&
			runtimeConfiguration.network.Wireless == null)
	) {
		throw new Error('No network configuration provided');
	}

	forEach(runtimeConfiguration.network, value => {
		if (value != null && !(value in networkInterfaces())) {
			throw new Error(`Network interface ${value} is not available`);
		}
	});

	return runtimeConfiguration as Leviathan.RuntimeConfiguration;
}
