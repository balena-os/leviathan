module.exports = [
  {
    suite: `${__dirname}/../../suites/os`,
    config: {
      deviceType: 'raspberrypi3',
      networkWired: false,
      networkWireless: true,
      workerType: 'testbot',
      downloadType: 'local',
      interactiveTests: false,
      apiUrl: 'balena-cloud.com',
    },
    image: `${__dirname}/../../../demo/rpi3A+/balena.img.gz`,
    workers: {
      deviceType: 'raspberrypi3',
      balenaApplication: 'Leviathan-Demo',
      apiKey: process.env.API_KEY,
    },
  },
];
