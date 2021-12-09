// Check Config.js reference for all documentation on config.js
// https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html


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
			interactiveTests: false, // redundant
    
			// Needed the provision the DUT to a balenaCloud fleet
			balenaApiKey: process.env.BALENA_CLOUD_API_KEY,
			balenaApiUrl: 'balena-cloud.com',
			organization: process.env.BALENA_CLOUD_ORG,
		},
    
		// balenaOS image that is uploaded to the testbot
		image: `${__dirname}/balena.img`,
		
    // Worker configuration
    // Different ways to configure the worker:
    // https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html#different-workers-configurations-available
		workers: {
			balenaApplication: 'testbot-personal',
			apiKey: process.env.BALENA_CLOUD_API_KEY
		}
  }, 
	{
		deviceType: "raspberrypi3",
		suite: `${__dirname}/../suites/hup`,
		config: {
				networkWired: false,
				networkWireless: true,
				interactiveTests: false,
				balenaApiKey: process.env.BALENACLOUD_API_KEY,
				balenaApiUrl: 'balena-cloud.com',
				organization: process.env.BALENACLOUD_ORG
		},
		image: `${__dirname}/balena.img.gz`,
		// Worker configuration
    // Different ways to configure the worker:
    // https://balena-os.github.io/leviathan/pages/Getting-Started/config-reference.html#different-workers-configurations-available
		workers: ['https://123213bda32048sgd5dfw223423723324.balena-devices.com/']
	},
	{
		deviceType: "raspberrypi3",
		suite: `${__dirname}/../suites/os`,
		config: {
				networkWired: false,
				networkWireless: true,
				interactiveTests: false,
				balenaApiKey: process.env.BALENACLOUD_API_KEY,
				balenaApiUrl: 'balena-cloud.com',
				organization: process.env.BALENACLOUD_ORG
		},
		image: `${__dirname}/balena.img.gz`,
		// To run on a Qemu worker
		workers: ['http://localhost/']
	}
];
