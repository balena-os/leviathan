resinOS Automated Testing
=========================

[![CircleCI](https://circleci.com/gh/resin-io/resinos-tests/tree/master.svg?style=svg&circle-token=f7e1e5220b3f5864c9821b2f39a84a1a50d5a2c9)](https://circleci.com/gh/resin-io/resinos-tests/tree/master)

> An automated test suite for resinOS

This project is built using JavaScript and the Ava test framework, and is
expected to run under the provided Docker image.

Getting Started
---------------

#### Clone/Initialize the repository

This repository makes use of git submodules, therefore you should run the following command after cloning:

```
git submodule update --init --recursive
```

#### Setup

First, you need a [resin.io](https://resin.io/) account to use during the tests. You can use your
personal one or create an account for the purpose of testing (recommended).

The test suite must be configured with a set of environment variables that you
can export before running the tests:

- `RESINOS_TESTS_APPLICATION_NAME`: the application name to use during the
  tests (will be created by the test suite)
- `RESINOS_TESTS_DEVICE_TYPE`: the device type to test (like `raspberrypi3`)
- `RESINOS_TESTS_RESINOS_VERSION`: the device version to test (default uses `latest`)
- `RESINOS_TESTS_RESINOS_VERSION_UPDATE`: the version that the device will be updated to (default uses `latest`)
- `RESINOS_TESTS_API_KEY`: the API key created for authenticating
- `RESINOS_TESTS_NETWORK`: choose the network connection type (`ethernet` or `wifi+ethernet`)
- `RESINOS_TESTS_WIFI_SSID`: the WIFI SSID the provisioned device should connect to
- `RESINOS_TESTS_WIFI_KEY`: the WIFI passphrase the provisioned device should use
- `RESINOS_TESTS_DISK`: the device that should be provisioned with resinOS (i.e. `/dev/disk3`)
- `RESINOS_TESTS_TMPDIR`: modify temporary directory
- `RESINOS_TESTS_RESINIO_URL`: insert production API url (i.e. `resin.io`)
- `RESINOS_TESTS_RESINIO_STAGING_URL`: insert staging API url (i.e. `resinstaging.io`)
- `RESINOS_TESTS_RESIN_SUPERVISOR_DELTA`: enable delta updates (`0` - disable, `1` - enable)
- `RESINOS_TESTS_ENABLE_INTERACTIVE_TESTS`: enable interactive tests

Finally, you can run the test suite by executing:

```
make test
```

Support
-------

If you're having any problem, please [raise an issue][newissue] on GitHub and
the resin.io team will be happy to help.

Contribute
----------

- Issue Tracker: [github.com/resin-io/resinos-tests/issues][issues]
- Source Code: [github.com/resin-io/resinos-tests][source]

Before submitting a PR, please make sure that you include tests, and that
linters run without any warning:

```
make code-check
```

License
-------

The project is licensed under the Apache 2.0 license.

[issues]: https://github.com/resin-io/resinos-tests/issues
[newissue]: https://github.com/resin-io/resinos-tests/issues/new
[source]: https://github.com/resin-io/resinos-tests
