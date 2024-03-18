# Frequently Asked Questions (FAQ's)

## Table of Contents
  s- [Checking if Autokit is ready to run tests](#checking-if-autokit-is-ready-to-run-tests)
  - [Config issues](#config-issues)
  - [Recovering the Autokit](#recovering-the-autokit)
  - [How to troubleshoot connection issues between Leviathan and devices under test?](#how-to-troubleshoot-connection-issues-between-leviathan-and-devices-under-test)
  - [How to write a new test or contribute to an existing test suite?](#how-to-write-a-new-test-or-contribute-to-an-existing-test-suite)
  - [Debugging tests in Leviathan](#debugging-tests-interactively-in-leviathan)


## Checking if Autokit is ready to run tests

Testing with autokit requires several component to work together. It's crucial all steps in the Getting Started guide are completed to make sure the autokit is working correctly. To verify if the setup is correct, you can do the following steps. 

1. To check availablity of a autokit manually, you can run the following command:

```
$ curl -X POST PUBLIC-DEVICE-URL-OF-AUTOKIT/status
```

2. If the status is IDLE, then we can run a short diagnostics test to see if the autokit is working correctly. Run the Leviathan e2e test described in this section {@page Getting Started with Autokit Worker  | Start your first test run} on the autokit you like to verify. After completeing the Levaithan pre-requistes listed above the section, you can create your config.js and add the Public Device URL in the `workers` section.  

If the test without any errors, then the autokit should be ready to run the tests. 

## Config issues

```sh
Invalid device type: <device-type-without>
```

If you see this, then make sure that the contract for your device type is available in the `contracts` submodule in `leviathan/core/contracts/contracts/hw.device-type`.

```
OS image not found: ENOENT: no such file or directory, access '/usr/src/app/workspace/image.img.gz'
```

Make sure your OS image is stored in `leviathan/workspace` directory. 

```
No workers found for deviceType: DEVICETYPE-SLUG
```

No device could be found for this device type slug in the Autokit fleet you specificed. There could be several reasons for this error in order to resolve it:

1. The wrong fleet or device type was being targetted. Check the test configuration present in the test logs.
2. If not, then check the BalenaCloud fleet, and check the `DUT` tag of the autokit devices in the fleet containing the device type slug. If you don't find a `DUT` tag matching the slug, then the worker doesn't exist. 
3. If you do find a device, check the status of the autokit by running the following command. 

```
$ curl -X POST PUBLIC-DEVICE-URL-OF-AUTOKIT/status
```

4. If the status is BUSY, then the device is running tests for another job. 
5. If the status is IDLE, then the device is available to run the tests but somehow still not been able to take up test job. Refer to next section. 


## Recovering the Autokit 

Upon starting a test, you might see the following errors or there could be other symptoms when the autokit doesn't seem to be responsive. 

```
Already running a suite. Please stop it or try again later.
```

This means, Leviathan couldn't find an available worker to run the tests on. It does that by checking each eligible worker's availablitity and then selecting an IDLE one if found. If the test is stuck due to error or the testbot can't recover from a previous test run, then run the following command to safely restore the autokit to IDLE state.

```
$ curl -X POST PUBLIC-DEVICE-URL-OF-AUTOKIT/teardown
OK
```

If it still doesn't work out, try performing a reboot of the autokit. 

## How to troubleshoot connection issues between Leviathan and devices under test?

Connection issues have been creating numerous issues in our testing lately. This can be due to VPN/API outages, DUT disconnecting or the Worker getting stuck. Such cases would lead to retires, connection resets, and delays that interrupt or fail the tests entirely. We are still debugging these issues on a case by case basis. Our goal remains to make Leviathan more stable and reliable and reducing our dependence on VPN/API connections. 

Please do log the following issues as you see them on https://github.com/balena-os/leviathan/issues/

## How to write a new test or contribute to an existing test suite?

Leviathan is an open source project and we welcome contributions. If you want to add a new test suite or contribute to an existing one, start by {@page Writing tests | writing your first test}. For reference, checkou the existing BalenaOS operating system suite in the [meta-balena](https://github.com/balena-os/meta-balena/tree/master/tests/suites) repository

## Debugging tests interactively in Leviathan

To improve workflow and write tests faster on Levaithan, the following debug options can be triggered to alter the behavior of test runs. A `debug` object can be added to the `config.js` file right with the existing suite's config. Additionally, the `debug` object can also have custom options as per the need of the test suite. These properties will become available during the test run and can be used to further customize the test run as needed. Example of a debug object:

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

You can use `this.suite.options` to access the `CUSTOM_OPTION` property in your test suite.

Checkout the [config.example.js](https://github.com/balena-os/leviathan/blob/master/workspace/config.example.js) file for a complete example.