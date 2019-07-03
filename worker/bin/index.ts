import setup from '../lib/index';

(async function(): Promise<void> {
	let port: number = 80;

	if (process.env.PORT != null) {
		port = parseInt(process.env.PORT);
	}

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
