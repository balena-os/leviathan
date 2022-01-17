# Config.js Reference

Create the `config.js` file in the `workspace` directory using the [config.example.js](https://github.com/balena-os/leviathan/blob/master/workspace/config.example.js) file. 

```js
module.exports = {
    deviceType: '<DUT device type, for example "raspberrypi3-64">',
    suite: `${__dirname}/../suites/os`,
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

Information on properties in `config.js`:

- **`deviceType`** is the Device Under Test (DUT) attached to the testbot. Example: Raspberrypi3 64-bit device, the `deviceType` property needs to be `raspberrypi3-64`.
- **`suite`** is the absolute path to the test suite directory that you want to execute. The path after `__dirname` in the config is a path relative to the workspace directory.
- **`networkWired`** and **`networkWireless`** properties for configuration of Network Manager. Used to configure the right mode of connection for the DUT to connect to the Access Point (AP) created by the testbot.
- **`balenaApiKey`** is the balenaCloud API key used when running the release suite. Ideally, you can add it as an environment variable and reference it with `process.env.BALENACLOUD_API_KEY`.
- **`balenaApiUrl`** is the balenaCloud environment you are targetting for your test suite. Production is `'balena-cloud.com'` and staging is `'balena-staging.com'`.
- **`organization`** is the balenaCloud organizations where test applications are created. Ideally, you can add it as an environment variable and reference it with `process.env.BALENACLOUD_ORG`.
- **`image`** is the absolute path to the balenaOS image that is flashed onto the Device Under Test (DUT). The image should be kept under the `workspace` directory. The path after `__dirname` in the config is a path relative to the workspace directory. Make sure to rename the image to balena.img. If you provide `balena.img` as your balenaOS image, then Leviathan will compress it for you in `gz` format. We recommend compressing beforehand, as it saves time. 

_If you don't want to upload an image, set the image property to `false`. For example: To run the e2e test suite, you don't need to upload an image._

- **`workers`** is the property where we specify precisely on which testbots the test suites will be executed on. You can specify this in multiple ways as per the requirement. 
- **`downloadVersion`**: If you intend to download a balenaOS version for your tests, then you can use this property to specify the balenaOS version semver. The `fetchOS` helper will find and download the balenaOS image. To find the implementation, check https://github.com/balena-os/leviathan/blob/556ae5b52aacc28e72c42ca20413ed0e742126b3/core/lib/components/balena/sdk.js#L557 

*Deprecated Properties*

- `downloadType` configures where the OS will be staged for upload to testbot. `local` is the only available value for it at the moment

### Different `workers` configurations available

1. **Using <UUID>.local** - The last line in the `config.json` above assumes you are on the same network with the testbot. Note: that on some Linux distributions, the container will not be able to resolve `.local` addresses. If you face this problem until we find a proper solution, you can replace this address with your device's local IP (copy it from the device summary page on balenaCloud).

```js
workers: ['http://<short UUID of your testbot in balenaCloud>.local'],
```

2. **Using public URLs** - If the testbot is not on the same network as you, please enable the public URL in balenaCloud and use that in the `workers` array. If multiple URLs are provided, then each testbot in the array would be running the same test suite listed in the `config.js`. Queueing support is WIP, where two or more test suites can be run on the same worker using public URLs.

```js
workers: ['Public URL of your testbot'],
```

3. **Using a balenaCloud application** - Using a workers object, you can specify a balenaCloud application containing testbots (connected to DUTs) and a balenaCloud API key. All testbots inside that balenaCloud application can be used to run test suites. These testbots need to be online and contain a `DUT` tag with the value being the `deviceType` to be selected for testing. Leviathan looks for all devices inside that balenaCloud application with `DUT` tag and pushes test jobs to available testbots. This method is often used for testbot rigs in production use cases, with several testbots available as workers to run the tests. Multiple tests can be queued and made to run in parallel on compatible workers.

```js
workers: {
   balenaApplication: process.env.BALENACLOUD_APPLICATION_NAME,
   apiKey: process.env.BALENACLOUD_API_KEY
}
```

4. **Specify Localhost for QEMU worker** - When intending to test using a QEMU worker, then use the follow configuration.

```js
workers: ['http://localhost'],
```

### `config.js` Examples

Following is an exhaustive list of config.js examples which can be used for reference
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
            organization: process.env.BALENACLOUD_ORG,
        },
        image: `${__dirname}/balena.img.gz`,
        workers: {
            balenaApplication: 'testbot-vipul',
            apiKey: "blah-blah-blah",
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
            organization: process.env.BALENACLOUD_ORG
        },
        image: `${__dirname}/balena.img.gz`,
        workers: {
            balenaApplication: 'testbot-vipul',
            apiKey: "blah-blah-blah",
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
            organization: process.env.BALENACLOUD_ORG
        },
        image: `${__dirname}/balena.img.gz`,
        workers: {
            balenaApplication: 'testbot-vipul',
            apiKey: "blah-blah-blah",
        }
    }]
```
<br>

## Running 2 test suites parallely on 2 seperate workers

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
            organization: process.env.BALENACLOUD_ORG,
        },
        image: `${__dirname}/balena.img.gz`,
        workers: ['https://6ad523252f8288bdff15bda320485237.balena-devices.com/']
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
            organization: process.env.BALENACLOUD_ORG
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
            organization: process.env.BALENACLOUD_ORG,
        },
        image: `${__dirname}/balena-DEVICETYPE-1.img.gz`,
        workers: {
            balenaApplication: 'testbot-personal',
            apiKey: "blah-blah-blah",
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
            organization: process.env.BALENACLOUD_ORG
        },
        image: `${__dirname}/balena-DEVICETYPE-2.img.gz`,
        workers: {
            balenaApplication: 'testbot-personal',
            apiKey: "blah-blah-blah",
        }
    }]
```

Add more objects to the array for as many workers that you need to target in the development rig to run your tests. Do make sure to specify the balenaOS images or assets correctly needed for each test suite you run for each worker.

`config.js` files are validated using this [schema](https://github.com/balena-os/leviathan/blob/master/client/lib/schemas/multi-client-config.js). Some properties are optional with the ability to add new properties as required. After adding data to config.js, the properties will be available throughout the execution of the test suite.
