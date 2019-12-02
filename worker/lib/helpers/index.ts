import * as Bluebird from 'bluebird';
import { spawn } from 'child_process';
import * as sdk from 'etcher-sdk';
import * as mdns from 'multicast-dns';
import { networkInterfaces } from 'os';

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
	args: Array<string>,
	cwd: string,
): Bluebird<void> {
	return new Bluebird((resolve, reject) => {
		const proc = spawn(command, args, {
			cwd: cwd,
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
	for (const signal of ['SIGINT', 'SIGTERM'] as Array<NodeJS.Signals>) {
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

			const nics = networkInterfaces();
			for (const i in nics) {
				for (const j in nics[i]) {
					if (nics[i][j].family === 'IPv4') {
						sockets.push(mdns({ interface: nics[i][j].address }));
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
