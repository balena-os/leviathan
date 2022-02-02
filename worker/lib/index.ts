import * as bodyParser from 'body-parser';
import { ChildProcess, spawn, exec } from 'child_process';
import { multiWrite } from 'etcher-sdk';
import * as express from 'express';
import * as http from 'http';
import { getSdk } from 'balena-sdk';
import { Readable, Stream } from 'stream';
import { join } from 'path';
import { homedir } from 'os';
import * as tar from 'tar-fs';
import * as util from 'util';
const execSync = util.promisify(exec)
const pipeline = util.promisify(Stream.pipeline);


import { executeCommandOverSSH, executeCommandInHostOS } from './helpers/ssh';

import {
	resolveLocalTarget,
} from './helpers';
import { TestBotWorker } from './workers/testbot';
import QemuWorker from './workers/qemu';
import { writeFileSync, readFile, remove } from 'fs-extra';
import { createGzip, createGunzip } from 'zlib';
import { retryAsync } from 'ts-retry';
import * as rp from 'request-promise';

import { Contract } from '../typings/worker';

const balena = getSdk({
	apiUrl: 'https://api.balena-cloud.com/',
});

const workersDict: Dictionary<typeof TestBotWorker | typeof QemuWorker> = {
	testbot_hat: TestBotWorker,
	qemu: QemuWorker,
};

var state = 'IDLE';
var heartbeatTimeout: NodeJS.Timeout;
const tunnels:ChildProcess[] = [];

async function setup(runtimeConfiguration: Leviathan.RuntimeConfiguration)
	: Promise<express.Application> {
	const possibleWorkers = Object.keys(workersDict);
	if (!possibleWorkers.includes(runtimeConfiguration.workerType)) {
		throw new Error(
			`${runtimeConfiguration.workerType} is not a supported worker`,
		);
	}

	const worker: Leviathan.Worker = new workersDict[
		runtimeConfiguration.workerType
	]({
		worker: { workdir: runtimeConfiguration.workdir },
		network: runtimeConfiguration.network,
		screenCapture: runtimeConfiguration.screenCapture,
		qemu: runtimeConfiguration.qemu,
	});


	/**
	 * Server context
	 */
	const jsonParser = bodyParser.json();
	const app = express();
	const httpServer = http.createServer(app);


	const supportedTags = [`dut`, `screencapture`, `modem`];
	// parse labels and create 'contract'
	const contract: Contract = {
		uuid: process.env.BALENA_DEVICE_UUID,
		workerType: runtimeConfiguration.workerType,
		supportedFeatures: {}
	};

	if (
		typeof process.env.BALENA_API_KEY === 'string' &&
		typeof process.env.BALENA_DEVICE_UUID === 'string'
	) {
		await balena.auth.loginWithToken(process.env.BALENA_API_KEY);
		const tags = await balena.models.device.tags.getAllByDevice(
			process.env.BALENA_DEVICE_UUID,
		);
		for (const tag of tags) {
			if (supportedTags.includes(tag.tag_key)) {
				contract.supportedFeatures[tag.tag_key] = tag.value === 'true' ? true : tag.value
			}
		}
	} else {
		console.log(`API key not available...`);
	}

	const CONTAINERPATH = `/tmp/container`
	await worker.setup();

	/**
	 * Setup DeviceUnderTest routes
	 */
	app.post(
		'/dut/on',
		async (
			_req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			const timer = setInterval(() => {
				res.write('status: pending');
			}, httpServer.keepAliveTimeout);

			try {
				await worker.powerOn();
			} catch (err) {
				next(err);
			} finally {
				clearInterval(timer);
				res.write('OK');
				res.end();
			}
		},
	);
	app.get(
		'/dut/diagnostics',
		async (
			_req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				res.send(await worker.diagnostics());
			} catch (err) {
				next(err);
			}
		},
	);
	app.post(
		'/dut/off',
		async (
			_req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				await worker.powerOff();
				res.send('OK');
			} catch (err) {
				next(err);
			}
		},
	);
	app.post(
		'/dut/network',
		jsonParser,
		async (
			req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				await worker.network(req.body);
				res.send('OK');
			} catch (err) {
				console.error(err);
				next(err);
			}
		},
	);
	app.get(
		'/dut/ip',
		jsonParser,
		async (
			req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				if (req.body.target != null) {
					res.send(await resolveLocalTarget(req.body.target));
				} else {
					throw new Error('Target missing');
				}
			} catch (err) {
				next(err);
			}
		},
	);
	app.get(
		'/contract',
		jsonParser,
		async (
			req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				res.send(JSON.stringify(contract));
			} catch (err) {
				next(err);
			}
		},
	);
	app.post(
		'/dut/capture',
		async (
			_req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				await worker.captureScreen('start');
				res.send('OK');
			} catch (err) {
				next(err);
			}
		},
	);
	app.get(
		'/dut/capture',
		async (
			_req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				await worker.captureScreen('stop');
				/// send the captured images to the core, instead of relying on volume
				const CAPTURE_PATH = join(runtimeConfiguration.workdir, 'capture');
				const line = pipeline(
					tar.pack(CAPTURE_PATH),
					createGzip({ level: 6 }),
					res
				).catch(error => {throw error});
				await line;
				res.send('OK');
			} catch (err) {
				next(err);
			}
		},
	);

	app.post(
		'/proxy',
		jsonParser,
		async (
			req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			// This function is effectively stubbed and does nothing except return 127.0.0.1.
			// Glider has been removed from the worker, since the old proxy tests were always
			// passing even without a working proxy, they were invalid.
			// New proxy tests install glider in a container on the DUT and don't use this endpoint.
			console.warn(`proxy endpoint has been deprecated, returning localhost`);
			try {
				if (req.body.port != null) {
					res.send('127.0.0.1');
				} else {
					res.send('OK');
				}
			} catch (err) {
				next(err);
			}
		},
	);
	app.post(
		'/teardown',
		async (
			_req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				await worker.teardown();
				state = 'IDLE';
				clearTimeout(heartbeatTimeout);
				for(let tunnel of tunnels){
					process.kill(tunnel.pid);
				}
				res.send('OK');
			} catch (e) {
				next(e);
			}
		},
	);
	app.use(function (
		err: Error,
		_req: express.Request,
		res: express.Response,
		_next: express.NextFunction,
	) {
		res.status(500).send(err.message);
	});
	app.post(
		'/dut/flash',
		async (req: express.Request, res: express.Response) => {
			function onProgress(progress: multiWrite.MultiDestinationProgress): void {
				res.write(`progress: ${JSON.stringify(progress)}`);
			}

			res.writeHead(202, {
				'Content-Type': 'text/event-stream',
				Connection: 'keep-alive',
			});

			const timer = setInterval(() => {
				res.write('status: pending');
			}, httpServer.keepAliveTimeout);

			try {
				worker.on('progress', onProgress);
				let imageStream = createGunzip();
				req.pipe(imageStream);
				await worker.flash(imageStream);
			} catch (e) {
				res.write(`error: ${e.message}`);
			} finally {
				worker.removeListener('progress', onProgress);
				res.write('status: done');
				res.end();
				clearInterval(timer);
			}
		},
	);

	app.get('/heartbeat', async (				
		req: express.Request,
		res: express.Response,) => {
		try {
			heartbeatTimeout.refresh();
			res.status(200).send('OK');
		} catch (e) {
			res.status(500).send(e.stack);
		}
	});

	app.get('/state', async (				
		req: express.Request,
		res: express.Response,) => {
		try {
			res.status(200).send(state);
		} catch (e) {
			res.status(500).send(e.stack);
		}
	});

	app.get('/start', async (				
		req: express.Request,
		res: express.Response,) => {
		try {
			if(state !== 'BUSY'){
				state = 'BUSY';
				heartbeatTimeout = setTimeout(async() => {
					console.log('Did not receive heartbeat from client - Tearing down...');
					await worker.teardown();
					state = 'IDLE';
				}, 1000*60);
				res.status(200).send('OK')
			} else{
				res.status(200).send('BUSY');
			}
		} catch (e) {
			res.status(500).send(e.stack);
		}
	});

	app.get('/dut/serial', (
		req: express.Request, 
		res: express.Response,) => {
		
		const reportPath = '/reports/dut-serial.txt';
		readFile(reportPath, (err, data) => {
			if (err) {
				console.error(`Unable to read ${reportPath}`, reportPath);
				res.status(500);
				res.send({ message: 'Cannot read the requested report' });
				return;
			}

			res.setHeader('content-type', 'text/plain');
			res.status(200);
			res.send(data);
		});
	});

	app.post(
		'/tunnel',
		jsonParser,
		async (
			req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			try {
				let ip = await resolveLocalTarget(req.body.target)
				let args = [
					`tcp-listen:${req.body.workerPort},reuseaddr,fork`,
					`"ssh ${ip} p- 22222 -o StrictHostKeyChecking=no /usr/bin/nc localhost ${req.body.dutPort}"`
				]
				console.log(args);
				// create a tunnel to DUT in a sub process, then add the id of that sub process to an array so we can then tear down
				// even if the DUT reboots, the tunnel will re-establish (tested manually)
				let tunnelProc = spawn(`socat`, args);
				tunnels.push(tunnelProc);
				res.send('OK');
			} catch (err) {
				console.log(err)
				next(err);
			}
		}
	);

	return app;
}

export default setup;
