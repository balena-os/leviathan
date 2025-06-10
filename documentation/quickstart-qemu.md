# Getting Started with QEMU Worker

This is a quick start guide for using the Leviathan testing framework with a virtualized QEMU Device Under Test (DUT) called the QEMU worker. This workflow is particularly helpful for debugging, faster tester runs than actual hardware or if you don't have hardware on hand. 

Before beginning, make sure you completed the Leviathan pre-requisted listed on the [Quickstart Page](quickstart.md).

## Start your first test run

For your first test run, we will be running the [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites/e2e). This is a basic testing suite to test your worker configuration and if the setup is correct. Each Levaithan test run needs the following to start testing that the user has to provide:

1. **The test suite you want to run**: [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites/e2e) (already provided)
2. **A balenaOS image used to flash, provision and test the DUT**. The test will automatically download an OS image this time. So no need to provide your own image.
3. To run QEMU tests, we need the TUN interface. Run the following commands to activate the TUN module. 

```
sudo modprobe tun
```

4. **A test configuration using the `config.js` file**: Let's create one.

### Build your `config.js` file

The config.js file is the master configuration file for your test runs in leviathan. The QEMU worker spins up and configures your device under test (DUT) according to the settings provided in the `config.js` file. To know more about each property, refer to the [Config.js reference](config-reference.md).

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
    },
    image: false, 
    workers: ['http://worker'],
};
```

Ensure that you fill all fields in the `config.js` file before proceeding. Refer to the [Config.js reference](config-reference.md) for more information

You can either modify the `config.js` file or provide values using environment variables. To provide values of environment variables easily, you can create a `.env` file in the root of the leviathan directory. Use the format below as boilerplate.

```bash
WORKSPACE=./workspace
REPORTS=./workspace/reports
SUITES=/path/to/suites
DEVICE_TYPE=intel-nuc
WORKER_TYPE=qemu
BALENACLOUD_API_KEY=SAMPLEKEYuhfuwehfewiuf[...]LLJA
BALENACLOUD_ORG=g_username_of_the_user
```

Refer to the [Environment Variables Reference](config-reference.md) for more values you can specify.


### Start the run

To start the test run, navigate to the root of the Leviathan directory and run the following command:

```
make local-test
```

This will trigger a build of client and core services using docker-compose and begin the test. The logs by various componenet will start streaming on the terminal. Wait for the test scenario to finish and check the device logs on the dashboard in the meantime. 

> Refer to [FAQ's for common issues mentioned below and debug your test setup](debugging.md)

A successful run of the e2e test suite without any errors makes sure that your QEMU worker is set up correctly and can be used for further tests.

## Let's run some "real" tests

We will start with a test run of the [balenaOS unmanaged testing suite](https://github.com/balena-os/meta-balena/tree/master/tests/suites). To get the tests, clone the [meta-balena](https://github.com/balena-os/meta-balena/) repository. The OS tests are located in the `tests/suites/` directory.

- Either copy the `OS` test suite directory from meta-balena to the `suites` directory 
- or point the `suite` property in your config.js file to the relative path of the OS test suite like mentioned below.

```js
module.exports = {
    deviceType: 'genericx86-64-ext',
    suite: `${__dirname}/../suites/os`, // this path is relative to the workspace directory
    config: {
        networkWired: false,
        networkWireless: false,
        downloadVersion: 'latest',
        balenaApiKey: process.env.BALENACLOUD_API_KEY,
        balenaApiUrl: 'balena-cloud.com',
        organization: 'BALENACLOUD_ORG_GOES_HERE',
    },
    image: `${__dirname}/path/to/image`,
    workers: ['http://worker'],
};
```

This time you can provide your own OS image to test. You can download an unmanaged genericx86-64-ext balenaOS image from [balena.io/os](https://www.balena.io/os/#download) and place it in the `workspace` directory. Change the value of the `image` property to the path of the image you downloaded. This will be the OS image used by the OS tests in Leviathan.

### Start the OS test

Run `make local-test` in the root of the project and watch the logs. 

The logs will start streaming on the terminal for the test run. At the end of the run, reports and logs for the test run will be stored in `workspace/reports` directory.

That's the end of the quick start guide, you successfully setup your QEMU worker and ran your first test suite.

## Where do you go from here?

1. Start by [writing your first test](writing-tests.md).
2. To know more about `config.js` and its properties, refer to [Config.js reference](config-reference.md).
3. To understand the bigger picture about the project read/watch these [resources](learn-more.md).
4. Some tips and references for [writing better tests](reference-tips.md) with Leviathan.
5. Check out the source for tests that you ran, [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites).

## Advanced

Worker configuration variables can be specified in `docker-compose.qemu.yml`, under `environment`. The default configuration should suffice in most cases.

| Variable            | Description                                         |
| ------------------- | --------------------------------------------------- |
| QEMU_ARCH           | Architecture to virtualize (default: x86_64)        |
| QEMU_CPUS           | Number of CPUs to virtualize (default: 4)           |
| QEMU_MEMORY         | Amount of memory to virtualize (default: 2G)        |
| QEMU_BRIDGE_NAME    | Name of bridge to use for networking (default: br0) |
| QEMU_BRIDGE_ADDRESS | IP address to assign to bridge                      |
| QEMU_DHCP_RANGE     | Range of DHCP addresses to hand out to workers      |
