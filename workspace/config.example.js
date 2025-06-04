// Config.js examples

// Check Config.js reference for all documentation on config.js files
// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html

// Use the following config to run the e2e tests with some customizations

module.exports = [
	{
		// Device under test (DUT) name goes here
		deviceType: "raspberrypi3",

		// Suite name goes here
		suite: `${__dirname}/../suites/e2e`,
		config: {

			// Network configuration for the DUT 
			networkWired: false,
			networkWireless: true,

			// For tests that need a specific balenaOS version to be downloaded. Default: latest
			downloadVersion: 'latest',
			// For tests that need a specific balenaOS image type to be downladed. Default: default image type available from balena Clouc
			// Can be set to one of ['raw', 'flasher'], don't define if distinction is not needed.
			// downloadImageType: 'flasher',

			// Needed the provision the DUT to a balenaCloud fleet
			balenaApiKey: process.env.BALENACLOUD_API_KEY,
			balenaApiUrl: 'balena-cloud.com',
			organization: 'BALENACLOUD_ORG_GOES_HERE',
		},

		// Path to the gzipped image to be tested goes here. This image is used to provision the DUT
		image: `${__dirname}/balena.img.gz`,

		// Worker configuration: Pointing to a Fleet
		// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html#different-workers-configurations-available
		workers: {
			balenaApplication: 'testbot-personal',
			apiKey: process.env.BALENACLOUD_API_KEY
		},

		debug: {
			// Exit the ongoing test suite if a test fails
			failFast: false,
			// Exit the ongoing test run if a test fails
			globalFailFast: false,
			// Persist downloadeded artifacts
			preserveDownloads: false,
			// Mark unstable tests to be skipped
			unstable: ["Kill the device under test"],
		},
	},
	// 
	// {
	// 	deviceType: "raspberrypi3",
	// 	suite: `${__dirname}/../suites/os`,
	// 	config: {
	// 		networkWired: false,
	// 		networkWireless: true,
	// 		balenaApiKey: process.env.BALENACLOUD_API_KEY,
	// 		balenaApiUrl: 'balena-cloud.com',
	// 		organization: 'BALENACLOUD_ORG_GOES_HERE'
	// 	},
	// 	image: `${__dirname}/balena.img.gz`,
	// 	// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html#different-workers-configurations-available
	// 	workers: {
	// 		balenaApplication: 'testbot-personal',
	// 		apiKey: process.env.BALENACLOUD_API_KEY
	// 	}
	// },
	// 
	// 	
	// {
	// 	deviceType: "raspberrypi3",
	// 	suite: `${__dirname}/../suites/hup`,
	// 	config: {
	// 		networkWired: false,
	// 		networkWireless: true,
	// 		balenaApiKey: process.env.BALENACLOUD_API_KEY,
	// 		balenaApiUrl: 'balena-cloud.com',
	// 		organization: 'BALENACLOUD_ORG_GOES_HERE'
	// 	},
	// 	image: `${__dirname}/balena.img.gz`,
	// 	// Worker configuration: Public URL's
	// 	// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html#different-workers-configurations-available
	// 	workers: ['https://123213bda32048sgd5dfw223423723324.balena-devices.com/']
	// },
	// 
	// 
	// {
	// 	deviceType: "genericx86-64-ext",
	// 	suite: `${__dirname}/../suites/os`,
	// 	config: {
	// 		networkWired: false,
	// 		networkWireless: true,
	// 		balenaApiKey: process.env.BALENACLOUD_API_KEY,
	// 		balenaApiUrl: 'balena-cloud.com',
	// 		organization: 'BALENACLOUD_ORG_GOES_HERE'
	// 	},
	// 	// balenaOS image that is uploaded to the testbot
	// 	image: `${__dirname}/balena.img.gz`,
	// 	// Worker configuration to run the QEMU worker
	// 	// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html#different-workers-configurations-available
	// 	workers: ['http://worker']
	// }
];
