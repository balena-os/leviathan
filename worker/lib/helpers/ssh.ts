import * as Bluebird from 'bluebird'

import { NodeSSH } from 'node-ssh';
import { assignIn } from 'lodash';

const getSSHClientDisposer = (config: any) => {
	const createSSHClient = (conf: any) => {
		return Bluebird.resolve(
			new NodeSSH().connect(
				assignIn(
					{
						agent: process.env.SSH_AUTH_SOCK,
						keepaliveInterval: 10000 * 60 * 5, // 5 minute interval
					},
					conf,
				),
			),
		);
	};

	return createSSHClient(config).disposer((client: any) => {
		client.dispose();
	});
};


/**
 * This is the base hostOS execution command used by many other functions like `executeCommandIntoHostOs` to
 * execute commands on the DUT being passed through SSH.
 *
 * @param {string} command The command to be executed over SSH
 * @param {*} config
 *
 * @category helper
 */
export async function executeCommandOverSSH (command: string, config: any) {
	return Bluebird.using(getSSHClientDisposer(config), (client: any) => {
		return new Bluebird(async (resolve:any, reject:any) => {
			client.connection.on('error', (err:Error) => {
				reject(err);
			});
			resolve(
				await client.exec(command, [], {
					stream: 'both',
				}),
			);
		});
	});
}

export async function executeCommandInHostOS(command:string, target:string) {
	// execute command over ssh here - TODO - do we keep the retries?
	const result: any = await executeCommandOverSSH(
		`source /etc/profile ; ${command}`,
		{
			host: target,
			port: '22222',
			username: 'root',
		},
	);

	if (typeof result.code === 'number' && result.code !== 0) {
		throw new Error(
			`"${command}" failed. stderr: ${result.stderr}, stdout: ${result.stdout}, code: ${result.code}`,
		);
	}

	return result.stdout;
}
