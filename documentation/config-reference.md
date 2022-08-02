# Config.js Reference

Create the `config.js` file in the `workspace` directory using the [config.example.js](https://github.com/balena-os/leviathan/blob/master/workspace/config.example.js) file. Environment variables referenced in the documentation are merely suggestions. You can technically use hardcoded values, but it is a common practice to get some `config.json` fields from the environment by setting them to something like `process.env.MY_ENV_VAR`.

```js
module.exports = {
    deviceType: '<DUT device type, for example "raspberrypi3-64">',
    suite: `${__dirname}/../suites/<name-of-test-suite>`,
    config: {
        networkWired: false,
        networkWireless: true,
        downloadVersion: 'latest',
        balenaApiKey: process.env.BALENACLOUD_API_KEY,
        balenaApiUrl: 'balena-cloud.com',
        organization: 'BALENACLOUD_ORG_GOES_HERE',
    },
    image: `${__dirname}/balena.img.gz`,
    workers: ['http://<short UUID of your testbot in balenaCloud>.local'],
};
```

Information on properties in `config.js`:

- **`deviceType`** is the Device Under Test (DUT) attached to the testbot. Example: Raspberrypi3 64-bit device, the `deviceType` property needs to be `raspberrypi3-64`.
- **`suite`** is the absolute path to the test suite directory that you want to execute.  As shown in the example above, `${__dirname}` expands to the absolute path of the `workspace` directory, so you can use it to specify a path relative to `workspace`.
- **`networkWired`** and **`networkWireless`** properties are configuration for the Network Manager. This sets up the Access Point (AP) created by the testbot for the DUT to use while provisioning.
- **`balenaApiKey`** is the balenaCloud API key used when running the cloud release suite. 
- **`balenaApiUrl`** is the balenaCloud environment you are targetting for your test suite. Production is `'balena-cloud.com'` and staging is `'balena-staging.com'`.
- **`organization`** is the balenaCloud organization where test applications are created for the cloud suite.
- **`image`** is the absolute path to the balenaOS image that is flashed onto the Device Under Test (DUT).  As shown in the example above, `${__dirname}` expands to the absolute path of the `workspace` directory, so you can use it to specify a path relative to `workspace`.

Make sure to rename the image to balena.img. If you provide `balena.img` as your balenaOS image, then Leviathan will compress it for you in `gz` format on runtime. We recommend compressing beforehand, as it saves time. For any reason if your tests download an image already and you don't want to upload an image, then set the `image` property to `false` in config.js 

For example, in the e2e test suite, if you don't upload an image and set `image: false`, then the test suite will download the image from balenaCloud. This is test specific, not a leviathan feature. 

- **`downloadVersion`**: If you intend to download a balenaOS version for your tests, then you can use the property to specify the balenaOS version semver. The `fetchOS` helper will use this property to find and download the balenaOS image. 
- **`workers`** is the property where we specify precisely where the test suites will be executed on and what type of workers are going to be used. You can specify this in multiple ways as per your requirements: 

## Different `workers` configurations available

1. **<UUID>.local** - The last line in the `config.json` above assumes you are on the same network with the testbot worker. Note that on some Linux distributions, the container will not be able to resolve `.local` addresses. If you face this problem until we find a proper solution, you can replace this address with your device's local IP (copy it from the device summary page on balenaCloud).

```js
workers: ['http://<short UUID of your testbot in balenaCloud>.local'],
```

2. **Public device URLs** - If the testbot is not on the same network as you, please enable the public URL in balenaCloud and use that in the `workers` array. If multiple URLs are provided, then each URL in the array will run the same test suite listed in the `config.js`.

```js
workers: ['Public URL of your testbot'],
```

3. **Workers object for testbot worker** - Using a workers object, you can specify a balenaCloud application containing testbots (connected to DUTs) and a balenaCloud API key. All testbots inside that balenaCloud application can be used to run test suites. These testbots need to be online and contain a `DUT` tag with the value being the `deviceType` to be selected for testing. Leviathan looks for all devices inside that balenaCloud application with `DUT` tag and pushes test jobs to available testbots. This method is often used for testbot rigs in production use cases, with several testbots available as workers to run the tests. Multiple tests can be queued and made to run in parallel on compatible workers.

```js
workers: {
   balenaApplication: 'some-org/testbot-personal',
   apiKey: process.env.BALENACLOUD_API_KEY
}
```

4. **Specify `worker` for QEMU worker** - Using the following configuration leviathan will run the test suite on a QEMU worker.

```js
workers: ['http://worker'],
```

### `config.js` Examples

Following is an exhaustive list of `config.js` examples which can be used for reference.

#### Running 3 test suites parrallely using workers objects

```js
module.exports = [{
        deviceType: "raspberrypi3",
        suite: `${__dirname}/../suites/os`,
        config: {
            networkWired: false,
            networkWireless: true,
            downloadVersion: 'latest',
            balenaApiKey: process.env.BALENACLOUD_API_KEY,
            balenaApiUrl: 'balena-cloud.com',
            organization: 'BALENACLOUD_ORG_GOES_HERE',
        },
        image: `${__dirname}/balena.img.gz`,
        workers: {
            balenaApplication: 'testbot-vipul',
            apiKey: process.env.BALENACLOUD_API_KEY,
        },
    },
    {
        deviceType: "raspberrypi3",
        suite: `${__dirname}/../suites/hup`,
        config: {
            networkWired: false,
            networkWireless: true,
            downloadVersion: 'latest',
            balenaApiKey: process.env.BALENACLOUD_API_KEY,
            balenaApiUrl: 'balena-cloud.com',
            organization: 'BALENACLOUD_ORG_GOES_HERE',
        },
        image: `${__dirname}/balena.img.gz`,
        workers: {
            balenaApplication: 'testbot-vipul',
            apiKey: process.env.BALENACLOUD_API_KEY,
        }
    },
    {
        deviceType: "raspberrypi3",
        suite: `${__dirname}/../suites/cloud`,
        config: {
            networkWired: false,
            networkWireless: true,
            downloadVersion: 'latest',
            balenaApiKey: process.env.BALENACLOUD_API_KEY,
            balenaApiUrl: 'balena-cloud.com',
            organization: 'BALENACLOUD_ORG_GOES_HERE',
        },
        image: `${__dirname}/balena.img.gz`,
        workers: {
            balenaApplication: 'testbot-vipul',
            apiKey: process.env.BALENACLOUD_API_KEY,
        }
    }]
```
<br>

## Running the same test suite on 2 separate workers

```js
module.exports = [{
        deviceType: "raspberrypi3",
        suite: `${__dirname}/../suites/os`,
        config: {
            networkWired: false,
            networkWireless: true,
            downloadVersion: 'latest',
            balenaApiKey: process.env.BALENACLOUD_API_KEY,
            balenaApiUrl: 'balena-cloud.com',
            organization: 'BALENACLOUD_ORG_GOES_HERE',
        },
        image: `${__dirname}/balena.img.gz`,
        workers: ['https://6ad523252f8288bdff15bda320485237.balena-devices.com/']
    },
    {
        deviceType: "raspberrypi3",
        suite: `${__dirname}/../suites/os`,
        config: {
            networkWired: false,
            networkWireless: true,
            downloadVersion: 'latest',
            balenaApiKey: process.env.BALENACLOUD_API_KEY,
            balenaApiUrl: 'balena-cloud.com',
            organization: 'BALENACLOUD_ORG_GOES_HERE',
        },
        image: `${__dirname}/balena.img.gz`,
        workers: ['https://123213bda32048sgd5dfw223423723324.balena-devices.com/']
    }]
```

## Running tests on the development rig

In order to kick off tests on multiple workers in the fleet, extend the configuration present below to run your tests on all available workers. 

```js
module.exports = [{
        deviceType: "DEVICETYPE-1",
        suite: `${__dirname}/../suites/YOUR-TEST-SUITE`,
        config: {
            networkWired: false,
            networkWireless: true,
            downloadVersion: 'latest',
            balenaApiKey: process.env.BALENACLOUD_API_KEY,
            balenaApiUrl: 'balena-cloud.com',
            organization: 'BALENACLOUD_ORG_GOES_HERE',
        },
        image: `${__dirname}/balena-DEVICETYPE-1.img.gz`,
        workers: {
            balenaApplication: 'testbot-personal',
            apiKey: process.env.BALENACLOUD_API_KEY,
        }
    },
    {
        deviceType: "DEVICETYPE-2",
        suite: `${__dirname}/../suites/YOUR-TEST-SUITE`,
        config: {
            networkWired: false,
            networkWireless: true,
            downloadVersion: 'latest',
            balenaApiKey: process.env.BALENACLOUD_API_KEY,
            balenaApiUrl: 'balena-cloud.com',
            organization: 'BALENACLOUD_ORG_GOES_HERE',
        },
        image: `${__dirname}/balena-DEVICETYPE-2.img.gz`,
        workers: {
            balenaApplication: 'testbot-personal',
            apiKey: process.env.BALENACLOUD_API_KEY,
        }
    }]
```

Add more objects to the array for as many workers that you need to target in the development rig to run your tests. Do make sure to specify the balenaOS images or assets correctly needed for each test suite you run for each worker.

`config.js` files are validated using this [schema](https://github.com/balena-os/leviathan/blob/master/client/lib/schemas/multi-client-config.js). Some properties are optional with the ability to add new properties as required. After adding data to config.js, the properties will be available throughout the execution of the test suite.
