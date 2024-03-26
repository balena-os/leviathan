module.exports = [{
  deviceType: process.env.DEVICE_TYPE,
  suite: `${__dirname}/../suites/cloud`,
  config: {
    networkWired: false,
    networkWireless: process.env.WORKER_TYPE === 'qemu' ? false : true,
    downloadVersion: 'latest',
    balenaApiKey: process.env.ENVIRONMENT === 'balena-machine' ? process.env.BALENAMACHINE_API_KEY : process.env.BALENACLOUD_API_KEY,
    balenaApiUrl: process.env.ENVIRONMENT === 'balena-machine' ? process.env.BALENAMACHINE_API_URL : process.env.BALENACLOUD_API_URL,
    organization: process.env.BALENACLOUD_ORG,
    sshConfig: process.env.ENVIRONMENT === 'balena-machine' ? {
			host: process.env.BALENACLOUD_SSH_URL,
			port: process.env.BALENACLOUD_SSH_PORT,
		} : {}
  },
  image: false,
  debug: {
    unstable: ["Kill the device under test"],
  },
  workers: process.env.WORKER_TYPE === 'qemu' ? ['http://worker'] : {
		balenaApplication: process.env.BALENACLOUD_APP_NAME,
		apiKey: process.env.ENVIRONMENT === 'balena-machine' ? process.env.BALENAMACHINE_API_KEY : process.env.BALENACLOUD_API_KEY,
	},
}];
