# Quick start 

This is a quick start guide for using the leviathan remote testing framework with a testbot. As a prerequisite for this guide, you will have to prepare your testbot, using the following [guide](https://github.com/balena-io/testbot-hardware/blob/master/documentation/getting-started.md).

## Prerequisites

- Ensure you have `docker` and node installed on your machine.
- Clone the [leviathan](https://github.com/balena-io/leviathan) repository and then `git submodule update --init --recursive` to install submodules.

## Build your config.json file

- Navigate to the `workspace` directory in the project using `cd workspace/`
- Create a `config.js` file in the `workspace` directory using the following template. To read more about the properties, check the {@page Config.js Reference | Config.js reference}.

```js
module.exports = {
    deviceType: '<DUT device type, for example "raspberrypi3-64">',
    // Multiple suites can be run on the same worker when specified as an array.
    suite: `${__dirname}/../suites/os`,
    config: {
        networkWired: false,
        networkWireless: true,
        downloadVersion: 'latest',
        interactiveTests: false,
        balenaApiKey: process.env.BALENACLOUD_API_KEY,
        balenaApiUrl: 'balena-cloud.com',
        organization: process.env.BALENACLOUD_ORG
    },
    image: `${__dirname}/balena.img`,
    // Make sure the public device URL is activated for the device
    // Read the reference guide to understand the multiple ways workers can be specified. 
    workers: ['http://<short UUID of your testbot in balenaCloud>.local'],
};
```

For QEMU workers, use localhost (`http://localhost`) instead of the `*.local` address for the `workers` property in the config.json file.

Check the {@page Config.js Reference | Config.js reference} for more examples. 

## Let's run some tests

- Use the tests from [meta-balena](https://github.com/balena-os/meta-balena/tree/master/tests/suites) instead. The OS test suite is recommended as it works with the least configuration. Either copy the OS test suite to the `suite` property path as mentioned in config.js or point the `suite` property to the path of the OS test suite.
- Extract the image you want to test to `./leviathan/workspace` and rename it to `balena.img`. You can downloaded unmanaged image from [balena.io/os](balena.io/os).
- Run `make test` in the root of the project and watch the logs.
- At the end of the run, reports and logs about the test will be stored in `workspace/reports` directory.
- With that, you have successfully completed your first test run.

## Where do you go from here?

1. Start by {@page Writing tests | writing your first test}.
2. To know more about the config.js and it's properties, refer to {@page Config.js Reference | Config.js reference}.
3. To understand the bigger picture about the project read/watch these {@page Links, and more links | resources}.
4. Some tips and references for {@page Tips and Reference | writing better tests} with Leviathan.
