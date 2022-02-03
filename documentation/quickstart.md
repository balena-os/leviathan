# Quick start 

This is a quick start guide for using the leviathan remote testing framework with a testbot. As a prerequisite, build your testbot using the following [guide](https://github.com/balena-io/testbot-hardware/blob/master/documentation/getting-started.md).

## Prerequisites

- Ensure you have `docker` and node installed on your machine.
- Clone the [leviathan](https://github.com/balena-io/leviathan) repository and then `git submodule update --init --recursive` to install submodules.

## Build your config.json file

The config.js file is the master configuration file for your test run. The testbot runs and configures your device under test (DUT) accordingly with the settings provided in the `config.js` file. To know more about each property, refer ti the {@page Config.js Reference | Config.js reference}.

To get started, 

- Navigate to the `workspace` directory in leviathan.
- Create a `config.js` file in the `workspace` directory using the `config.example.js` file. 
- The config.js file should look like the following. Here, we are assuming that the worker is a testbot with a raspberrypi3 DUT attached to it. The suite and the image path points to a test suite and a balenaOS image that is going to be tested. 
- The `config` object includes 

```
module.exports = {
    deviceType: "raspberrypi3",
    suite: `${__dirname}/../suites/e2e`,
    config: {
        networkWired: false,
        networkWireless: true,
        downloadVersion: 'latest',
        balenaApiKey: process.env.BALENACLOUD_API_KEY,
        balenaApiUrl: 'balena-cloud.com',
        organization: process.env.BALENACLOUD_ORG
    },
    image: `${__dirname}/balena.img.gz`,
    workers: ['http://<short UUID of your testbot in balenaCloud>.local'],
};
```

## Start your first test run

- For the first test run, we will be running the [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites/e2e). Make sure the the `suite` property in your config.js is pointing to the e2e suites directory like:

```JS
suite: `${__dirname}/../suites/e2e`,
```
 
- To start a test run, run the following command:

```
make test
```

- The logs will start streaming on the terminal for the test run. Wait for the test scenario to run and check the device logs on the dashboard in the meantime. If the test finished successfully without any errors, then your testbot is set up correctly and ready to run more tests.

## Let's run some "real" tests

We will start with a test run of the [balenaOS unmanaged testing suite](https://github.com/balena-os/meta-balena/tree/master/tests/suites). To get the tests clone the meta-balena repository and:

- Either copy the OS test suite from meta-balena to the `workspace` directory 
- or point the `suite` property to the path of the OS test suite in the meta-balena directory.
- Extract the image you want to test to `./leviathan/workspace` and rename it to `balena.img`. You can downloaded unmanaged image from [balena.io/os](balena.io/os).

```js
module.exports = {
    deviceType: '<DUT device type, for example "raspberrypi3-64">',
    // Multiple suites can be run on the same worker when specified as an array.
    suite: `${__dirname}/../suites/os`,
    config: {
        networkWired: false,
        networkWireless: true,
        downloadVersion: 'latest',
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

> For QEMU workers, use localhost (`http://localhost`) instead of the `*.local` address for the `workers` property in the config.json file.

- Run `make test` in the root of the project and watch the logs.
- At the end of the run, reports and logs for the test run will be stored in `workspace/reports` directory.

## Where do you go from here?

1. Start by {@page Writing tests | writing your first test}.
2. To know more about the config.js and it's properties, refer to {@page Config.js Reference | Config.js reference}.
3. To understand the bigger picture about the project read/watch these {@page Links, and more links | resources}.
4. Some tips and references for {@page Tips and Reference | writing better tests} with Leviathan.
