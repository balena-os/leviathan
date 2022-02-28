module.exports = [{
  deviceType: `genericx86-64-ext`,
  suite: `${__dirname}/../suites/e2e`,
  config: {
    networkWired: false,
    networkWireless: false,
    downloadVersion: 'latest',
    balenaApiKey: process.env.BALENACLOUD_API_KEY,
    balenaApiUrl: 'balena-cloud.com',
    organization: process.env.BALENACLOUD_ORG
  },
  image: false,
  workers: ['http://localhost']
}];
