import * as Bluebird from 'bluebird';
import { spawn } from 'child_process';
import * as sdk from 'etcher-sdk';
import * as drivelist from 'drivelist';
import { flatMap } from 'lodash';
import { networkInterfaces, tmpdir } from 'os';

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

export async function getStoragePath(label: string): Promise<string> {
	const drives = await drivelist.list();

	const result = flatMap(
		drives.map(drive => {
			return drive.mountpoints;
		}),
	).find(mountpoint => {
		return mountpoint.label === label;
	});

	if (result != null) {
		return result.path;
	}

	return tmpdir();
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
