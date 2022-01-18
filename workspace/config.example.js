// Check Config.js reference for all documentation on config.js
// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html

// Use the following config to run the e2e tests. Further commented configs c
module.exports = [
	{
		// Device under test (DUT) name goes here
		deviceType: "raspberrypi3",
		// SUITE NAME GOES HERE
		suite: `${__dirname}/../suites/e2e`,
		config: {

			// Network configuration for the DUT 
			networkWired: false,
			networkWireless: true,

			// balenaOS version that is downloaded using fetchOS helper. Default: latest
			downloadVersion: 'latest',

			// Needed the provision the DUT to a balenaCloud fleet
			balenaApiKey: process.env.BALENA_CLOUD_API_KEY,
			balenaApiUrl: 'balena-cloud.com',
			organization: process.env.BALENA_CLOUD_ORG,
		},

		// If you don't want to upload an image, set the image property to false
		// To run the e2e test suite, you won't need to upload an image
		image: false,

		// Worker configuration: Pointing to a Fleet
		// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html#different-workers-configurations-available
		workers: {
			balenaApplication: 'testbot-personal',
			apiKey: process.env.BALENA_CLOUD_API_KEY
		}
	},
	// {
	// 	deviceType: "raspberrypi3",
	// 	suite: `${__dirname}/../suites/os`,
	// 	config: {
	// 		networkWired: false,
	// 		networkWireless: true,
	// 		balenaApiKey: process.env.BALENACLOUD_API_KEY,
	// 		balenaApiUrl: 'balena-cloud.com',
	// 		organization: process.env.BALENACLOUD_ORG
	// 	},
	// 	// balenaOS image that is uploaded to the testbot
	// 	image: `${__dirname}/balena.img.gz`,
	// 	// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html#different-workers-configurations-available
	// 	workers: {
	// 		balenaApplication: 'testbot-personal',
	// 		apiKey: process.env.BALENA_CLOUD_API_KEY
	// 	}
	// },
	// {
	// 	deviceType: "raspberrypi3",
	// 	suite: `${__dirname}/../suites/hup`,
	// 	config: {
	// 		networkWired: false,
	// 		networkWireless: true,
	// 		balenaApiKey: process.env.BALENACLOUD_API_KEY,
	// 		balenaApiUrl: 'balena-cloud.com',
	// 		organization: process.env.BALENACLOUD_ORG
	// 	},
	// 	// balenaOS image that is uploaded to the testbot
	// 	image: `${__dirname}/balena.img.gz`,
	// 	// Worker configuration: Public URL's
	// 	// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html#different-workers-configurations-available
	// 	workers: ['https://123213bda32048sgd5dfw223423723324.balena-devices.com/']
	// },
	// {
	// 	deviceType: "genericx86-64-ext",
	// 	suite: `${__dirname}/../suites/os`,
	// 	config: {
	// 		networkWired: false,
	// 		networkWireless: true,
	// 		balenaApiKey: process.env.BALENACLOUD_API_KEY,
	// 		balenaApiUrl: 'balena-cloud.com',
	// 		organization: process.env.BALENACLOUD_ORG
	// 	},
	// 	// balenaOS image that is uploaded to the testbot
	// 	image: `${__dirname}/balena.img.gz`,
	// 	// Worker configuration to run the QEMU worker
	// 	// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html#different-workers-configurations-available
	// 	workers: ['http://localhost/']
	// }
];
