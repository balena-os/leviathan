# Getting Started with Autokit Worker 

This is a quick start guide for using the leviathan framework with the autokit worker.

## As a prerequisite

1. Make sure you have built your autokit using the following [guide](https://github.com/balena-io-hardware/autokit-assembly-doc)
2. Go through the steps listed on the {@page Quickstart | Quickstart Page}

## Provision your autokit into a leviathan-worker fleet

To use the autokit with the leviathan framework, your autokit must be running a [leviathan-worker](https://github.com/balena-os/leviathan-worker) container. We recommed provisioning the autokit host to a balena fleet:

1. If you don't already have access to a fleet, [create one](https://docs.balena.io/learn/getting-started/raspberrypi3/nodejs/#create-a-fleet)
2. Navigate to the [leviathan-worker](https://github.com/balena-os/leviathan-worker) repository. Clone it, and from that repository use `balena push` to [push a new release to your fleet](https://docs.balena.io/learn/deploy/deployment/#overview)
3. [Provision](https://docs.balena.io/learn/deploy/deployment/#overview) your autokit to this fleet. Depending on the device-type of your autokit host, the process may differ. Ensure that you provision the device using the image configured to use **ethernet only**. 
4. When the device is successfully provisioned on balenaCloud, make sure to enable the public URL for your device.
5. Add the appropriate environment variables to the device. You may have to adjust these depending on the autokit setup and the device under test. The main ones, relevant to the leviathan-worker are:
   
| Variable Name | Description | Required |
| --- | --- | --- |
| `TESTBOT_DUT_TYPE` | Set to the device type slug of the DUT from the [supported devices](https://github.com/balena-io-hardware/autokit-interface-sw/tree/master/lib/flashing/devices) listed here. If your DUT is not listed, then proceed to choose the device type that resembles the flashing procedure of the DUT. For example, a flashing a sd card and booting process resembles the process of `raspberrypi4-64`. Similarly, for a flasher image use `intel-nuc`. | True |
| `WORKER_TYPE` | Set to the type of worker you intend to use with Leviathan. In this case, it's an autokit. Hence, set to `autokit`. | True |
| Autokit Setup Variables | Refer to the [autokit setup variables](https://github.com/balena-os/leviathan-worker/blob/master/lib/workers/autokit.ts#L17) and ensure they are appropriately configured if any hardware differs from the default. Cross-reference these strings with the [autokit feature implementations](https://github.com/balena-io-hardware/autokit-interface-sw/tree/master/lib/features) for more information. |

Any other relevent autokit variables must be set, if the default values aren't appropriate

| Variable Name | Description | Default | Required |
| --- | --- | --- | --- |
| `WIFI_IF` | The name of the primary WiFi interface of the autokit host. | `wlan0` | No |
| `WIRED_IF` | The name of the USB-Ethernet interface of the autokit host. This can be found by accessing the autokit host over SSH. | `eth0` | No |
| `DEV_SERIAL` | The name of the USB-serial interface of the autokit. | `/dev/ttyUSB0` | No |

6. When that the `worker` container on your autokit host has started, the logs in the dashboard should read the message `worker setup completed`. If the container is not starting, the most likely cause could be either the hardware not plugged in correctly, or the needed env vars weren't set up correctly.
7. Lastly, add a device tag for your autokit in balenaCloud. The tag will be for the key named "DUT" with the value being the slug of the device under test. For example, the following as a balenaCloud device tag.

```
DUT: raspberrypi3
```

Future work will simplify this process to avoid manual configuration of environment variables where possible.

## Start your first test run

For your first test run, we will be running the [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites/e2e). This is a basic testing suite to test your worker configuration and if the setup is correct. Each Levaithan test run needs the following to start testing that the user has to provide:

1. **The test suite you want to run**: [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites/e2e) (already provided)
2. **A balenaOS image used to flash, provision and test the DUT**. The test will automatically download an OS image this time. So no need to provide your own image.  
3. **A test configuration using the `config.js` file**: Let's create one.

### Build your `config.js` file

The `config.js` file is the master configuration file for your test run. Leviathan runs and configures your device under test (DUT) according to the settings configured under `config.js` file. To know more about each property, refer to the {@page Config.js Reference | Config.js reference}.

Create your own config.js file

- Navigate to the `workspace` directory in leviathan.
- Create a `config.js` file in the `workspace` directory and paste the contents below.

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
    image: false,
    workers: ['<Public device URL of your autokit>'],
}
```

Ensure that you fill all fields in the `config.js` file before proceeding. Refer to the {@page Config.js Reference | Config.js reference} for more information

You can either modify the `config.js` file or provide values using environment variables. To provide values of environment variables easily, you can create a `.env` file in the root of the leviathan directory. Use the format below as boilerplate. 


```bash
WORKSPACE=./workspace
REPORTS=./workspace/reports
SUITES=./path/to/suites
DEVICE_TYPE=raspberrypi3
WORKER_TYPE=autokit
BALENACLOUD_API_KEY=SAMPLEKEYuhfuwehfewiuf[...]LLJA
BALENACLOUD_ORG=g_username_of_the_user
```

Refer to the {@page Config.js Reference | Environment Variables Reference} for more values you can specify.

### Start the run

To start the test run, navigate to the root of the Leviathan directory and run the following command:

```
make test
```

This will trigger a build of client and core services using docker-compose and begin the test. The logs by various componenet will start streaming on the terminal. Wait for the test scenario to finish and check the device logs on the dashboard in the meantime. 

A successful run of the e2e test suite without any errors makes sure that your autokit worker is set up correctly and can be used for further tests.


## Let's run some "real" tests


We will start with a test run of the [balenaOS unmanaged testing suite](https://github.com/balena-os/meta-balena/tree/master/tests/suites). To get the tests, clone the [meta-balena](https://github.com/balena-os/meta-balena/) repository. The OS tests are located in the `tests/suites/` directory.

- Either copy the `OS` test suite directory from meta-balena to the `suites` directory 
- or point the `suite` property in your config.js file to the relative path of the OS test suite like mentioned below.

```js
module.exports = {
     deviceType: "raspberrypi3",
    suite: `${__dirname}/../suites/os`, // this path is relative to the workspace directory
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

This time you can provide your own OS image to test. You can download an unmanaged genericx86-64-ext balenaOS image from [balena.io/os](https://www.balena.io/os/#download) and place it in the `workspace` directory. Change the value of the `image` property to the path of the image you downloaded. This will be the OS image used by the OS tests in Leviathan.

### Start the OS test

Run `make test` in the root of the project and watch the logs.

The logs will start streaming on the terminal for the test run. At the end of the run, reports and logs for the test run will be stored in `workspace/reports` directory.

That's the end of the quick start guide, you successfully setup your autokit worker and ran your first test suite.

## Where do you go from here?

1. Start by {@page Writing tests | writing your first test}.
2. To know more about `config.js` and its properties, refer to {@page Config.js Reference | Config.js reference}.
3. To understand the bigger picture about the project read/watch these {@page Links, and more links | resources}.
4. Some tips and references for {@page Tips and Reference | writing better tests} with Leviathan.
5. Check out the source for tests that you ran, [e2e test suite](https://github.com/balena-os/leviathan/tree/master/suites).
