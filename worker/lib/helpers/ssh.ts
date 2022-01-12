const Bluebird = require('bluebird');
const SSH = require('node-ssh');
const assignIn = require('lodash/assignIn');

const getSSHClientDisposer = (config) => {
	const createSSHClient = (conf) => {
		return Bluebird.resolve(
			new SSH().connect(
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

	return createSSHClient(config).disposer((client) => {
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
export async function executeCommandOverSSH (command, config) {
	return Bluebird.using(getSSHClientDisposer(config), (client) => {
		return new Bluebird(async (resolve, reject) => {
			client.connection.on('error', (err) => {
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
