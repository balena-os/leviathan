import * as bodyParser from 'body-parser';
import { ChildProcess, exec } from 'child_process';
import { multiWrite } from 'etcher-sdk';
import * as express from 'express';
import * as http from 'http';
import { getSdk } from 'balena-sdk';
import config = require("config");
import {
	resolveLocalTarget,
} from './helpers';
import { TestBotWorker } from './workers/testbot';
import QemuWorker from './workers/qemu';
import { Contract } from '../typings/worker';
import * as peripherals from './peripherals/peripherals.json';

import * as util from 'util';
const execSync = util.promisify(exec)

const balena = getSdk({
	apiUrl: 'https://api.balena-cloud.com/',
});

const workersDict: Dictionary<typeof TestBotWorker | typeof QemuWorker> = {
	testbot_hat: TestBotWorker,
	qemu: QemuWorker,
};

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

	const proxy: { proc?: ChildProcess; kill: () => void } = {
		kill: () => {
			if (proxy.proc != null) {
				proxy.proc.kill();
			}
		},
	};

	const contract: Contract = {
		uuid: process.env.BALENA_DEVICE_UUID,
		workerType: config.get('worker.runtimeConfiguration.workerType'),
		supportedFeatures: {}
	};


	if(contract.workerType !== 'qemu' ){
		for(let peripheral of peripherals){
			let check = await execSync(peripheral.cmd);
			if (check.stdout === 'PASS'){
				contract.supportedFeatures[peripheral.slug] = true
			}
		}
	}

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
				proxy.kill();
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
				await worker.flash(req);
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

	return app;
}

export default setup;
