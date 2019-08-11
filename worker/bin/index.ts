import setup from '../lib/index';

(async function(): Promise<void> {
  let port: number = process.env.PORT != null ? parseInt(process.env.PORT) : 2000;

  const app = await setup({
    workdir: '/data'
  });

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
