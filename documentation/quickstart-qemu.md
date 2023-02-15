# Getting Started with QEMU Worker

This is a quick start guide for using the leviathan framework with the QEMU worker.

## Prepare Qemu worker

As a prerequisite: 
1. Go through the steps listed on the {@page Quickstart | Quickstart Page}

## Start your first test run

For your first test run, we will be running the [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites/e2e).

A balenaOS image that is used to flash and provision the device under test will be needed for the test. You can download an unmanaged genericx86-64-ext balenaOS image from [balena.io/os](https://www.balena.io/os/#download) and place it in the workspace folder. Leviathan support OS images uncompressed or compressed in `.gz` or `.zip` format.

### Build your `config.js` file

The config.js file is the master configuration file for your test runs in leviathan. The QEMU worker spins up and configures your device under test (DUT) according to the settings provided in the `config.js` file. To know more about each property, refer to the {@page Config.js Reference | Config.js reference}.

Create your own config.js file

- Navigate to the `workspace` directory in leviathan.
- Create a `config.js` file in the `workspace` directory and paste the contents below.

```js
module.exports = {
    deviceType: 'genericx86-64-ext',
    suite: `${__dirname}/../suites/e2e`,
    config: {
        networkWired: false,
        networkWireless: false,
        downloadVersion: 'latest',
        balenaApiKey: process.env.BALENACLOUD_API_KEY,
        balenaApiUrl: 'balena-cloud.com',
        organization: process.env.BALENACLOUD_ORG,
    },
    debug: {
        unstable: ["Kill the device under test"],
    }
    image: `${__dirname}/path/to/image`,
    workers: ['http://worker'],
};
```

To provide values of environment variables easily, you can create a `.env` file in the root of the leviathan directory. Use the format below as boilerplate. 

```
WORKSPACE=./workspace
REPORTS=./workspace/reports
SUITES=/path/to/suites
DEVICE_TYPE=intel-nuc
WORKER_TYPE=qemu
BALENACLOUD_API_KEY=<api key>
BALENACLOUD_ORG=<org>
BALENA_ARCH=amd64
BALENACLOUD_APP_NAME=<app-name>
```

To start the test run, navigate to the root of the leviathan directory and run the following command:

```
make local-test
```

This will first build the core and worker services and run the worker using docker-compose. Then, the test will run and the logs will start streaming on the terminal. Wait for the test scenario to finish and check the device logs on the dashboard in the meantime. 

A successful run of the e2e test suite without any errors makes sure that your QEMU worker is set up correctly and can be used for further tests.

## Let's run some "real" tests

We will start with a test run of the [balenaOS unmanaged testing suite](https://github.com/balena-os/meta-balena/tree/master/tests/suites). To get the tests, clone the meta-balena repository. The OS tests are located in the `tests/` directory.

- Either copy the `OS test suite` directory from meta-balena to the `workspace` directory 
- or point the `suite` property to the path of the OS test suite in the meta-balena directory.

```js
module.exports = {
    deviceType: 'genericx86-64-ext',
    suite: `${__dirname}/../suites/os`,
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
};
```

- Run `make local-test` in the root of the project and watch the logs. The logs will start streaming on the terminal for the test run.
- At the end of the run, reports and logs for the test run will be stored in `workspace/reports` directory.


That's the end of the quick start guide, you successfully setup your QEMu worker and ran your first test suite.

## Where do you go from here?

1. Start by {@page Writing tests | writing your first test}.
2. To know more about `config.js` and its properties, refer to {@page Config.js Reference | Config.js reference}.
3. To understand the bigger picture about the project read/watch these {@page Links, and more links | resources}.
4. Some tips and references for {@page Tips and Reference | writing better tests} with Leviathan.
5. Check out the source for tests that you ran, [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites).

## Advanced

Worker configuration variables can be specified in `docker-compose.local.yml`, under `environment`. The default configuration should suffice in most cases.

| Variable            | Description                                         |
| ------------------- | --------------------------------------------------- |
| QEMU_ARCH           | Architecture to virtualize (default: x86_64)        |
| QEMU_CPUS           | Number of CPUs to virtualize (default: 4)           |
| QEMU_MEMORY         | Amount of memory to virtualize (default: 2G)        |
| QEMU_BRIDGE_NAME    | Name of bridge to use for networking (default: br0) |
| QEMU_BRIDGE_ADDRESS | IP address to assign to bridge                      |
| QEMU_DHCP_RANGE     | Range of DHCP addresses to hand out to workers      |
