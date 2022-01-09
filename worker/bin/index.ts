import * as config from 'config';
import setup from '../lib/index';

(async function (): Promise<void> {
	const port: number = config.get('worker.port');

	const app = await setup();

	/**
	 * Start Express Server
	 */
	const server = app.listen(port, () => {
		const address = server.address();

		if (typeof address !== 'string') {
			console.log(`Worker http listening on port ${address.port}`);
		} else {
			throw new Error('Failed to allocate server address.');
		}
	});
})();
