import * as config from 'config';
import setup from '../lib/index';

(async function(): Promise<void> {
	const app = await setup();

	/**
	 * Start Express Server
	 */
	const socketPath = '/run/leviathan/worker.sock';
	const server = app.listen(socketPath, () => {
		console.log(`Worker http listening on ${socketPath}`);
	});
})();
