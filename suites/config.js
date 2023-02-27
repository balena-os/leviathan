module.exports = [{
  deviceType: process.env.DEVICE_TYPE,
  suite: `${__dirname}/../suites/e2e`,
  config: {
    networkWired: true,
    networkWireless: false,
    downloadVersion: 'latest',
    balenaApiKey: process.env.BALENACLOUD_API_KEY,
    balenaApiUrl: 'balena-cloud.com',
    organization: process.env.BALENACLOUD_ORG
  },
  image: false,
  debug: {
    unstable: ["Kill the device under test"],
  },
  workers:  ['http://localhost']
}];
