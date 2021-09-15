module.exports = [{
	deviceType: `raspberrypi3`,
	suite: `${__dirname}/../suites/e2e`,
	config: {
		networkWired: false,
		networkWireless: true,
	},
	image: `${__dirname}/balena.img.gz`,
	workers: {
		balenaApplication: process.env.BALENA_CLOUD_APP_NAME,
		apiKey: process.env.BALENA_CLOUD_API_KEY,
	},
}];
