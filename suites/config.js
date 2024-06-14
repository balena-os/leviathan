module.exports = [{
  deviceType: process.env.DEVICE_TYPE,
  suite: `${__dirname}/../suites/e2e`,
  config: {
    networkWired: false,
    networkWireless: process.env.WORKER_TYPE === 'qemu' ? false : true,
    downloadVersion: 'latest',
    balenaApiKey: process.env.BALENACLOUD_API_KEY,
    balenaApiUrl: process.env.BALENACLOUD_API_URL,
    organization: process.env.BALENACLOUD_ORG,
    sshConfig: {
			host: process.env.BALENACLOUD_SSH_URL,
			port: process.env.BALENACLOUD_SSH_PORT,
		}
  },
  image: `https://api.balena-cloud.com/download?deviceType=${process.env.DEVICE_TYPE}`,
  debug: {
    unstable: ["Kill the device under test"],
  },
  workers: process.env.WORKER_TYPE === 'qemu' ? ['http://worker'] : {
		balenaApplication: process.env.BALENACLOUD_APP_NAME,
		apiKey: process.env.BALENACLOUD_API_KEY,
	},
}];
