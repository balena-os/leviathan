module.exports = [
  {
    deviceType: 'genericx86-64-ext',
    // Multiple suites can be run on the same worker when specified as an array.
    suite: `${__dirname}/../suites/e2e`,
    config: {
      networkWired: false,
      networkWireless: false,
      downloadVersion: 'latest',
      balenaApiKey: process.env.BALENACLOUD_API_KEY,
      balenaApiUrl: 'balena-cloud.com',
      organization: 'BALENACLOUD_ORG_GOES_HERE',
    },
    image: `${__dirname}/balena.img`,
    workers: ['http://worker'],
    debug: {
      unstable: [
        "Kill the device under test"
      ],
    }
  },
  {
    deviceType: 'genericx86-64-ext',
    // Multiple suites can be run on the same worker when specified as an array.
    suite: `${__dirname}/../suites/real-e2e/os`,
    config: {
      networkWired: false,
      networkWireless: false,
      downloadVersion: 'latest',
      balenaApiKey: process.env.BALENACLOUD_API_KEY,
      balenaApiUrl: 'balena-cloud.com',
      organization: 'BALENACLOUD_ORG_GOES_HERE',
    },
    image: `${__dirname}/balena.img`,
    workers: ['http://worker'],
    debug: {
      unstable: [
        "chrony tests"
      ],
    }
  },
  {
    deviceType: 'genericx86-64-ext',
    // Multiple suites can be run on the same worker when specified as an array.
    suite: `${__dirname}/../suites/paulo-e2e`,
    config: {
      networkWired: false,
      networkWireless: false,
      downloadVersion: 'latest',
      balenaApiKey: process.env.BALENACLOUD_API_KEY,
      balenaApiUrl: 'balena-cloud.com',
      organization: 'BALENACLOUD_ORG_GOES_HERE',
    },
    image: `${__dirname}/balena.img`,
    workers: ['http://worker'],
  }
];
