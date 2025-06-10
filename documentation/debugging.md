# Frequently Asked Questions

## Table of Contents

  - [Finding the right autokit](#finding-the-right-autokit)
  - [Checking if Autokit is ready to run tests](#checking-if-autokit-is-ready-to-run-tests)
  - [Config issues when running tests](#config-issues-when-running-tests)
  - [Flashing issues](#flashing-issues)
  - [Manually interacting with the DUT](#manually-interacting-with-the-dut)
  - [Recovering the Autokit](#recovering-the-autokit)
  - [Connection issues between Leviathan and devices under test?](#connection-issues-between-leviathan-and-devices-under-test)
  - [Write new tests or contribute to an existing test suite?](#write-new-tests-or-contribute-to-an-existing-test-suite)
  - [Debugging tests interactively in Leviathan](#debugging-tests-interactively-in-leviathan)


## Finding the right autokit

If you have provided a fleet as your `workers` configuration, then Leviathan will search that fleet for an available autokit connected to the device type you want to run tests on. For example, check out the config below shortenned for brevity: 

```js
    {
      deviceType: "raspberrypi3",
      suite: `${__dirname}/../suites/os`,
      config: {
        balenaApiKey: '', 
        balenaApiUrl: 'balena-cloud.com',
        ...
      },
      image: false,
      workers: {
        balenaApplication: 'balena/testbot-rig',
        apiKey: "", // BM
      }
    }
```

Using this `config.js`, we can determine that Leviathan will be searching for an available autokit with a `DUT: raspberrypi3` tag in the `balena/testbot-rig` fleet in the `balena-cloud.com` environment to run the `os` test suite. Refer to the [fleet list](https://balena.fibery.io/Inputs/Pattern/BalenaOS-Testing-Leviathan-Autokit-Common-Issues,-Debugging-Context-4777/anchor=Testing-Fleets-to-find-the-right-autokit--cfc31205-72f4-4315-a0dd-a8240effcd40) to find balena's official autokit fleets used for testing. 

Once you find the right balenaCloud fleet where autokits are provisioned, you can check the DUT tags on the devices page to see which autokits are connected to the device type you want to test on. Once identified, run your tests targetting that autokit directly by providing the Public Device URL of the autokit in the `workers` configuration. For example: 

```
    workers: ['https://PUBLIC-DEVICE-URL.balena-devices.com/']
``` 

This will target the test run directly to the specific autokit, bypassing the fleet search that Leviathan conducts. If the autokit is available, then Leviathan will run the tests. 


## Checking if Autokit is ready to run tests

Testing with autokit requires several components to work together. All steps in the Getting Started guide must be completed to ensure the autokit works correctly. You can do the following steps to verify if the setup is correct. 

1. To check the availability of an autokit manually, you can run the following command:

```
$ curl -X POST PUBLIC-DEVICE-URL-OF-AUTOKIT/state
```

2. If the state is IDLE, we can run a short diagnostics test to see if the autokit works correctly. Run the Leviathan e2e test described in this section [Start your first test run](quickstart-autokit.md) on the autokit you want to verify. After completing the Leviathan prerequisites listed above the section, you can create your config.js and add the Public Device URL in the `workers` section.  

If the test completes without any errors, then the autokit should be ready to run the tests. 

## Config issues when running tests

```sh
Invalid device type: <device-type-without>
```

If you see this, ensure the contract for your device type is available in the `contracts` submodule in `leviathan/core/contracts/contracts/hw.device-type`.

```
OS image not found: ENOENT: no such file or directory, access '/usr/src/app/workspace/image.img.gz'
```

Ensure your OS image is stored in the `leviathan/workspace` directory. 

```
No workers found for deviceType: DEVICETYPE-SLUG
```

No device could be found for this device type slug in the Autokit fleet you specified. There could be several reasons for this error in order to resolve it:

1. The wrong fleet or device type was being targeted. Check the test configuration present in the test logs.
2. If not, check the balenaCloud fleet and check the `DUT` tag of the autokit devices in the fleet containing the device type slug. If you don't find a `DUT` tag matching the slug, then the worker doesn't exist. 
3. If you find a device, check the state of the autokit by running the following command. 

```
$ curl -X POST PUBLIC-DEVICE-URL-OF-AUTOKIT/state
```

4. If the state is BUSY, then the device is running tests for another job. 
5. If the state is IDLE, then the device is available to run the tests but is still unable to take up the test job. Refer to [Recovering the Autokit](#recovering-the-autokit) section. 


## Flashing issues

When the device fails during flashing - first check: has the correct `TESTBOT_DUT_TYPE` been selected (see above)?

If it has, we need a progression of checks. 

First, confirm that the power control is working for the DUT. This can be done by:

```sh
curl -X POST <autokit_ip>/dut/on
```

And checking that the DUT powers on. If it does, you can turn it back off with 

```sh
curl -X POST <autokit_ip>/dut/off
```

If that works, then check if the SD card is flashed with the image you wanted to flash to it. You can take the card out, plug it into your laptop and check. 

If it has, then check that the DUT was booting from the SD card - if you have a serial cable attached to the autokit, you can do this:

1. ssh into your autokit with `balena ssh <autokit_uuid> worker`
2. `apk add screen`
3. `screen <serial_dev> 115200`
4. In another SSH session: `usbsdmux /dev/sg0 dut` - this will toggle the MUX to the DUT 
5. Then `curl -X POST <autokit_ip>/dut/on` to power on the DUT
6. Check the serial output from the `screen` session. Is there anything?
7. If there isn't - then verify that the serial configuration is correct
8. If the serial configuration is correct, there should be some output on the `screen` session - you can see if it's failing to boot from the SD card or if it's booting into balena OS. 
9. If it's failing to boot from SD, try another card.


## Manually interacting with the DUT

Powering on and off can be done with: 

```sh
curl -X POST <autokit_ip>/dut/on
curl -X POST <autokit_ip>/dut/off
```

You can manually flash the DUT outside of the test suite with an image of your choice with:

```sh
curl --data-binary @<your image (must be .gz gzipped)> <autokit_ip or public url>/dut/flash
```

You can create a wired network for your DUT to connect to with:

```sh
curl -X POST localhost/dut/network -H 'Content-Type: application/json' -d '{"wired": {"nat":true}}'
```

You can create a wireless network with:

```sh
curl -X POST localhost/dut/network -H 'Content-Type: application/json' -d '{"wireless": {"ssid":"<EXAMPLE SSID>", "psk":"<EXAMPLE PSK", "nat": "true"}}'
```

After setting up one of these networks, you can access the DUT via the autokit.

You can find the DUT IP address by ssh'ing into the autokit and checking the `dnsmasq` lease files, for example:

```sh
root@3d57642:~# cat /var/lib/NetworkManager/dnsmasq-enp1s0u1u4u1u1.leases 
1708607547 d8:3a:dd:4b:6e:0f 10.42.0.248 ef0a7ac 01:d8:3a:dd:4b:6e:0f
``` 

then from the autokit command line

```sh
ssh 10.42.0.248 -p 22222
```

You can view the live HDMI output in your browser with `<autokit_ip or public url>/dut/liveStream`


## Recovering the Autokit 

Upon starting a test, you might see the following errors, or there could be other symptoms when the autokit isn't responsive. 

```
Already running a suite. Please stop it or try again later.
```

This means Leviathan couldn't find an available worker to run the tests on. It does that by checking each eligible worker's availability and then selecting an IDLE one if found. If the test is stuck due to an error or the testbot can't recover from a previous test run, then run the following command to restore the autokit to IDLE state safely.

```
$ curl -X POST PUBLIC-DEVICE-URL-OF-AUTOKIT/teardown
OK
```

If it still doesn't work out, try performing a reboot of the autokit. 

## Connection issues between Leviathan and devices under test?

Connection issues have been creating numerous problems in our testing lately. This can be due to VPN/API outages, DUT disconnecting, or the worker getting stuck. Such cases would lead to retires, connection resets, and delays that interrupt or fail the tests entirely. We are still debugging these issues on a case-by-case basis. Our goal is to make Leviathan more stable and reliable and reduce our dependence on VPN/API connections. 

Please do log the following issues as you see them on https://github.com/balena-os/leviathan/issues/

## Write new tests or contribute to an existing test suite?

Leviathan is an open-source project, and we welcome contributions. If you want to add a new test suite or contribute to an existing one, start by [writing your first test](writing-tests.md). For reference, check the existing balenaOS operating system suite in the [meta-balena](https://github.com/balena-os/meta-balena/tree/master/tests/suites) repository

## Debugging tests interactively in Leviathan

To improve workflow and write tests faster on Leviathan, the following debug options can be triggered to alter the behavior of test runs. A `debug` object can be added to the `config.js` file right with the existing suite's config. The `debug` object can also have custom options as needed by the test suite. These properties will become available during the test run and can be used to customize the test run further as required. Example of a debug object:

```js
    debug: {
        failFast: false,
        globalFailFast: false,
        preserveDownloads: false,
        unstable: ["TITLE OF THE TEST 1", "TITLE OF THE TEST 2"]
        dev: false,
        // Custom value 
        CUSTOM_OPTION: 'Verycustomindeed',
    },
```

The supported debug options available are as follows:

1. `failFast`: Exit the ongoing test suite if a test fails. Type: `Boolean`. Value: `true` or `false`. Default: `true`.
2. `preserveDownloads`: Persist downloadeded artifacts. Type: `Boolean`. Value: `true` or `false`. Default: `false`.
3. `globalFailFast`: Exit the entire ongoing test run if a test fails. Type: `Boolean`. Value: `true` or `false`. Default: `false`.
4. `unstable`: Add titles of the test suite that need to be marked unstable in order to have them skipped from a test suite. Skipped tests are marked as `todo` in the test logs and `skipped` in the test results. Type: `Array`.
5. `dev`: Run tests in development mode with validation and other checks toggled off. Type: `Boolean`. Value: `true` or `false`. Default: `false`.

You can use `this.suite.options` to access your test suite's `CUSTOM_OPTION` property.

Check out the [config.example.js](https://github.com/balena-os/leviathan/blob/master/workspace/config.example.js) file for a complete example.
