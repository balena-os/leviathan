import * as config from 'config';
import setup from '../lib/index';
import { getRuntimeConfiguration } from '../lib/helpers';

(async function (): Promise<void> {
	const port: number = config.get('worker.port');

	const runtimeConfiguration = await getRuntimeConfiguration();
	const app = await setup(runtimeConfiguration);

	/**
	 * Start Express Server
	 */
	const server = app.listen(port, () => {
		const address = server.address();

		if (typeof address !== 'string') {
			console.log(`Worker http listening on port ${address.port}`);
		} else {
			console.log(`Worker listening at path ${address}`);
		}
	});
})();
