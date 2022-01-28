/**
 * Worker
 *
 * Simple compatibility shim for the previous worker implementation that got
 * the worker address/URL from a config file. This object was renamed
 * WorkerClient to indicate that it acts as a client to the API exposed by the
 * Worker, and the new WorkerClient object accepts an additional workerAddress
 * parameter.
 *
 * To maintain existing functionality, we create a new class inheriting from
 * WorkerClient that maintains the previous method of configuration.
 */
const WorkerClient = require('./workerClient');
const config = require('config');

module.exports = class Worker extends WorkerClient {
	constructor(
		deviceType,
		logger = { log: console.log, status: console.log, info: console.log }
	) {
		super(
			deviceType,
			`${config.get('worker.url')}:${config.get('worker.port')}`,
			logger
		);
	}
};
