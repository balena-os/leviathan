module.exports = {
	deviceType: 'raspberrypi3',
	suite: `${__dirname}/../../suites/os`,
	config: {
		networkWired: false,
		networkWireless: true,
		workerType: 'testbot',
		downloadType: 'local',
		interactiveTests: false,
		apiUrl: 'balena-cloud.com',
	},
	image: '../../../balena.img.gz',
	workers: {
		balenaApplication: 'Leviathan-Demo',
		apiKey: process.env.BALENA_CLOUD_API_KEY,
	},
};
