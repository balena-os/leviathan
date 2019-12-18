#!/usr/bin/env node
process.env['NODE_CONFIG_DIR'] = `${__dirname}/../config`;
const config = require('config');

const ajv = new (require('ajv'))({ allErrors: true });
const balena = require('balena-sdk')({
	apiurl: config.get('balena.apiUrl'),
});
const blessed = require('blessed');
const { fork } = require('child_process');
const { ensureDir } = require('fs-extra');
const { fs } = require('mz');
const schema = require('../lib/schemas/multi-client-config.js');
const { every, forEach } = require('lodash');
const { tmpdir } = require('os');
const url = require('url');
const path = require('path');

const yargs = require('yargs')
	.usage('Usage: $0 [options]')
	.option('h', {
		alias: 'help',
		description: 'display help message',
	})
	.option('c', {
		alias: 'config',
		description: 'configuration file for the multi run client',
		required: true,
		type: 'string',
	})
	.option('w', {
		alias: 'workdir',
		description: 'working directory',
		type: 'string',
		default: `${tmpdir()}/run`,
	})
	.option('p', {
		alias: 'print',
		description: 'print all output to stdout',
		type: 'boolean',
		default: false,
	})
	.option('n', {
		alias: 'non-interactive',
		description: 'use when calling from CI integrations',
		type: 'boolean',
		default: false,
	})
	.version()
	.help('help')
	.showHelpOnFail(false, 'Something went wrong! run with --help').argv;

class NonInteractiveState {
	info(data) {
		console.log(`INFO: ${data.toString()}`);
	}

	attachPanel(list) {
		list.forEach(elem => {
			let workerId;
			try {
				workerId = url
					.parse(elem.workers)
					.hostname.split(/\./, 2)[0]
					.substring(0, 7);
			} catch (e) {
				console.error(e);
				workerId = elem.workers.toString();
			}

			elem.status = () => {
				// Skip progress updates in non-interactive mode.
			};
			elem.info = data => {
				this.info(`[${workerId}] ${data.toString()}`);
			};
			elem.log = data => {
				console.log(`[${workerId}] ${data.toString().trimEnd()}`);
			};
		});
	}

	teardown() {
		console.log('Finished.');
	}
}

class State {
	constructor() {
		if (process.stdout.isTTY !== true) {
			throw new Error('The multi client requires a tty environmet to run in');
		}

		this.blessed = {
			screen: blessed.screen({
				log: 'client.log',
				dump: true,
				smartCSR: true,
			}),
		};

		this.blessed.main = {
			layout: blessed.layout({
				parent: this.blessed.screen,
				top: 'center',
				left: 'center',
				width: '100%',
				height: '100%',
				border: 'none',
			}),
		};

		this.blessed.main.info = blessed.text({
			label: 'main',
			align: 'left',
			parent: this.blessed.main.layout,
			width: '99%',
			height: '99%',
			border: 'line',
			scrollable: true,
			alwaysScroll: true,
			style: {
				border: {
					fg: '#009933',
				},
				label: {
					fg: '#009933',
				},
			},
		});

		this.blessed.screen.key(['C-c'], function() {
			process.kill(process.pid, 'SIGINT');
		});

		this.blessed.screen.render();
	}

	info(data) {
		this.blessed.main.info.setContent(` ${data.toString()}`);
		this.blessed.screen.render();
	}

	attachPanel(list) {
		this.blessed.main.info.height = '7%';

		list.forEach(elem => {
			const layout = blessed.layout({
				parent: this.blessed.main.layout,
				width: `${99 / list.length}%`,
				height: '93%',
			});

			const info = blessed.log({
				parent: layout,
				width: '100%',
				height: '20%',
				border: 'line',
				alwaysScroll: true,
				mouse: true,
				scrollable: true,
				style: {
					border: {
						fg: '#006600',
					},
				},
			});

			const status = blessed.progressbar({
				parent: layout,
				width: '100%',
				height: '6%',
				border: 'line',
				style: {
					bar: {
						bg: '#b35900',
					},
					border: {
						fg: '#ff9933',
					},
				},
			});

			const log = blessed.log({
				align: 'left',
				parent: layout,
				width: '100%',
				height: 'shrink',
				shrink: 'grow',
				border: 'line',
				scrollOnInput: true,
				mouse: true,
				scrollbar: true,
				style: {
					scrollbar: {
						bg: 'white',
					},
				},
			});

			status.hide();

			elem.status = ({ message, percentage }) => {
				percentage = Math.round(percentage);

				if (percentage !== 100) {
					if (status.hidden) {
						status.show();
					}
					status.setLabel(`${message} - ${percentage} %`);
					status.setProgress(percentage);
				} else {
					if (!status.hidden) {
						status.hide();
					}
				}
				this.blessed.screen.render();
			};
			elem.info = data => {
				info.setContent(` ${data.toString()}`);
				this.blessed.screen.render();
			};
			elem.log = data => {
				log.add(` ${data.toString().trimEnd()}`);
				this.blessed.screen.render();
			};
		});

		this.blessed.screen.render();
	}

	teardown() {
		this.blessed.screen.destroy();
	}
}

(async () => {
	const state = yargs['non-interactive']
		? new NonInteractiveState()
		: new State();

	try {
		await ensureDir(yargs.workdir);

		const runQueue = [];
		// Blessed setup for pretty terminal output

		let runConfigs = require(yargs.config);

		const validate = ajv.compile(schema);

		if (!validate(runConfigs)) {
			throw new Error(
				`Invalid configuration -> ${ajv.errorsText(validate.errors)}`,
			);
		}

		runConfigs = runConfigs instanceof Object ? [runConfigs] : runConfigs;

		state.info('Computing Run Queue');

		for (const runConfig of runConfigs) {
			if (runConfig.workers instanceof Array) {
				runConfig.workers.forEach(worker => {
					runQueue.push({ ...runConfig, workers: worker });
				});
			} else if (runConfig.workers instanceof Object) {
				await balena.auth.loginWithToken(runConfig.workers.apiKey);
				const tags = await balena.models.device.tags.getAllByApplication(
					runConfig.workers.balenaApplication,
				);

				for (const tag of tags.filter(tag => {
					return tag.tag_key === 'DUT' && tag.value === runConfig.deviceType;
				})) {
					if (!(await balena.models.device.hasDeviceUrl(tag.device.__id))) {
						throw new Error('Worker not publicly available. Panicking...');
					}
					runQueue.push({
						...runConfig,
						workers: await balena.models.device.getDeviceUrl(tag.device.__id),
					});
				}
			}
		}

		state.info('Running Queue');

		const children = {};

		process.on('exit', code => {
			process.exitCode = code || 1;

			if (Object.keys(children).length === 0) {
				console.log('No workers found...NO TESTS RAN');
			} else {
				process.exitCode =
					code ||
					every(children, child => {
						return child.code === 0;
					})
						? 0
						: 1;

				if (yargs.print) {
					children.forEach(child => {
						console.log(`=====| ${child.outputPath}`);
						console.log(fs.readFileSync(child.outputPath));
						console.log(`=====`);
					});
				}
			}
		});
		// Make sure we pass down our signal
		['SIGINT', 'SIGTERM'].forEach(signal => {
			process.on(signal, async sig => {
				state.info('Cleaning up');
				const promises = [];
				forEach(children, child => {
					promises.push(
						new Promise(async (resolve, reject) => {
							try {
								const procInfo = (
									await fs.readFile('/proc/' + child._child.pid + '/status')
								).toString();

								if (procInfo.match(/State:\s+[RSDT]/)) {
									child._child.on('exit', resolve);
									child._child.on('error', reject);
									child._child.kill(sig);
								} else {
									resolve();
								}
							} catch (e) {
								resolve();
							}
						}),
					);
				});
				await Promise.all(promises);

				state.teardown();

				process.exit(1);
			});
		});

		state.attachPanel(runQueue);

		while (runQueue.length > 0) {
			const run = runQueue.pop();
			const child = fork(
				path.join(__dirname, 'single-client'),
				[
					'-d',
					run.deviceType,
					'-i',
					run.image,
					'-c',
					run.config instanceof Object
						? JSON.stringify(run.config)
						: run.config,
					'-s',
					run.suite,
					'-u',
					run.workers,
				],
				{
					stdio: 'pipe',
					env: {
						CI: true,
					},
				},
			);

			child.on('message', ({ type, data }) => {
				switch (type) {
					case 'log':
						run.log(data);
						break;
					case 'status':
						run.status(data);
						break;
					case 'info':
						run.info(data);
						break;
					case 'error':
						run.log(data.message);
						break;
				}
			});

			// child state
			children[child.pid] = {
				_child: child,
				outputPath: `${yargs.workdir}/${url.parse(run.workers).hostname ||
					child.pid}.out`,
				exitCode: 1,
			};

			child.on('error', console.error);
			child.stdout.on('data', run.log);
			child.stderr.on('data', run.log);

			run.info(`WORKER URL: ${run.workers}`);

			child.on('exit', code => {
				children[child.pid].code = code;
			});
		}
	} catch (e) {
		state.info(
			`ERROR ENCOUNTERED: ${e.message}. \n Killing process in 10 seconds...`,
		);
		await require('bluebird').delay(10000);
		process.kill(process.pid, 'SIGINT');
	}
})();
