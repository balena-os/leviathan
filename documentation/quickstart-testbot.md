# [Deprecated] Getting Started with Testbot Worker 

This is a quick start guide for using the leviathan framework with the testbot worker. 

## As a prerequisite

1. Make sure you have built your testbot using the following [guide](https://github.com/balena-io/testbot-hardware/blob/master/documentation/getting-started.md)
2. Go through the steps listed on the [Quickstart Page](quickstart.md)

## Start your first test run

For your first test run, we will be running the [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites/e2e). 

A balenaOS image that is used to flash and provision the device under test will be needed for the test. You can download an unmanaged genericx86-64-ext balenaOS image from [balena.io/os](https://www.balena.io/os/#download) and place it in the workspace folder. Leviathan support OS images uncompressed or compressed in `.gz` or `.zip` format.

### Build your `config.js` file

The `config.js` file is the master configuration file for your test run. The testbot runs and configures your device under test (DUT) accordingly with the settings provided in the `config.js` file. To know more about each property, refer to the [Config.js reference](config-reference.md).

To get started, 

- Navigate to the `workspace` directory in leviathan.
- Create a `config.js` file in the `workspace` directory and paste the contents below: 

```js
module.exports = {
    deviceType: "raspberrypi3",
    suite: `${__dirname}/../suites/e2e`,
    config: {
        networkWired: false,
        networkWireless: true,
        downloadVersion: 'latest',
        balenaApiKey: process.env.BALENACLOUD_API_KEY,
        balenaApiUrl: 'balena-cloud.com',
        organization: process.env.BALENACLOUD_ORG,
    },
    debug: {
        unstable: ["Kill the device under test"],
    }
    image: `${__dirname}/path/to/image`,
    workers: ['<Public device URL of your testbot>'],
}
```

To provide values of environment variables easily, you can create a `.env` file in the root of the leviathan directory. Use the format below as boilerplate. 

```
WORKSPACE=./workspace
REPORTS=./workspace/reports
SUITES=/path/to/meta-balena/tests/suites
DEVICE_TYPE=raspberrypi3
BALENACLOUD_API_KEY=<api key>
BALENACLOUD_ORG=<org>
BALENA_ARCH=amd64
BALENACLOUD_APP_NAME=<app-name>
```


To start the test run, navigate to the root of the leviathan directory and run the following command:

```
make test
```

The logs will start streaming on the terminal for the test run. You will observe the related dependencies being built (This is a one time process). After then, the test will start. Wait for the test scenario to finish and check the device logs on the dashboard in the meantime. 

A successful run of the e2e test suite without any errors makes sure that your testbot worker is set up correctly and can be used for further tests.

## Let's run some "real" tests

We will start with a test run of the [balenaOS unmanaged testing suite](https://github.com/balena-os/meta-balena/tree/master/tests/suites). To get the tests, clone the [meta-balena](https://github.com/balena-os/meta-balena/) repository. The OS tests are located in the `tests/suites/` directory.

- Either copy the `OS` test suite directory from meta-balena to the `suites` directory 
- or point the `suite` property in your config.js file to the relative path of the OS test suite like mentioned below.

```js
module.exports = {
     deviceType: "raspberrypi3",
    suite: `${__dirname}/../suites/os`,
    config: {
        networkWired: false,
        networkWireless: true,
        downloadVersion: 'latest',
        balenaApiKey: process.env.BALENACLOUD_API_KEY,
        balenaApiUrl: 'balena-cloud.com',
        organization: process.env.BALENACLOUD_ORG,
    },
    image: `${__dirname}/path/to/image`,
    workers: {
        balenaApplication: 'your-fleet-slug',
        apiKey: process.env.BALENACLOUD_API_KEY
    }
};
```
- Add the slug of the device under test to the testbot. In the Admin Panel > Device Variables add the variable TESTBOT_DUT_TYPE:\<DUT_SLUG\>, and a testbot Tag named "DUT" that contains the slug of the device under test.
- Run `make test` in the root of the project and watch the logs. The logs will start streaming on the terminal for the test run.
- At the end of the run, reports and logs for the test run will be stored in `workspace/reports` directory.

That's the end of the quick start guide, you successfully setup your testbot worker and ran your first test suite.

## Where do you go from here?

1. Start by [writing your first test](writing-tests.md).
2. To know more about `config.js` and its properties, refer to [Config.js reference](config-reference.md).
3. To understand the bigger picture about the project read/watch these [resources](learn-more.md).
4. Some tips and references for [writing better tests](reference-tips.md) with Leviathan.
5. Check out the source for tests that you ran, [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites).
