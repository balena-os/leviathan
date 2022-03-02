import * as bodyParser from 'body-parser';
import { ChildProcess } from 'child_process';
import { multiWrite } from 'etcher-sdk';
import * as express from 'express';
import * as http from 'http';
import { getSdk } from 'balena-sdk';
import {
	getIpFromIface,
	resolveLocalTarget,
} from './helpers';
import { TestBotWorker } from './workers/testbot';
import QemuWorker from './workers/qemu';
import { Contract } from '../typings/worker';

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
	if (!possibleWorkers.includes(runtimeConfiguration.worker.deviceType)) {
		throw new Error(
			`${runtimeConfiguration.worker.deviceType} is not a supported worker`,
		);
	}

	const worker: Leviathan.Worker = new workersDict[
		runtimeConfiguration.worker.deviceType
	](runtimeConfiguration);

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

	const supportedTags = [`dut`, `screencapture`, `modem`];
	// parse labels and create 'contract'
	const contract: Contract = {
		uuid: process.env.BALENA_DEVICE_UUID,
		workerType: runtimeConfiguration.worker.deviceType,
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

				let ip;
				if (req.body.wired && (worker.state.network.wired != null)) {
					ip = {
						ip: getIpFromIface(worker.state.network.wired),
					};
				}
				if (req.body.wireless && (worker.state.network.wireless != null)) {
					ip = {
						ip: getIpFromIface(worker.state.network.wireless),
					};
				}
				if (ip == null) {
					throw new Error('DUT network could not be found');
				}

				res.send(ip);
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
				if (e instanceof Error) {
					res.write(`error: ${e.message}`);
				}
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
