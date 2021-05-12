module.exports = {
	worker: {
		port: 2000,
		runtimeConfiguration: {
			workdir: process.env.WORKDIR || '/data',
			workerType: process.env.WORKER_TYPE || 'testbot_hat',
			screenCapture: process.env.SCREEN_CAPTURE === 'true',
			network: {
				wired: process.env.NETWORK_WIRED_INTERFACE || 'eth1',
				wireless: process.env.NETWORK_WIRELESS_INTERFACE || 'wlan0',
			},
		},
	},
};
