TESTasdasdasdasd
resinOS Automated Testing
=========================

[![CircleCI](https://circleci.com/gh/resin-io/resinos-tests/tree/master.svg?style=svg&circle-token=f7e1e5220b3f5864c9821b2f39a84a1a50d5a2c9)](https://circleci.com/gh/resin-io/resinos-tests/tree/master)

> An automated test suite for resinOS

This project is built using TypeScript and the Ava test framework, and is
expected to run under the provided Docker image.

Getting Started
---------------

First, you need a resin.io account to use during the tests. You can use your
personal one, or create an account for the purpose of testing (recommended).
Keep in mind that since API keys are not ready for general usage yet, you will
have to trust the test suite with your email and password.

The test suite must be configured with a set of environment variables that you
can export before running the tests:

- `RESINOS_TESTS_APPLICATION_NAME`: the application name to use during the
  tests (will be created by the test suite)
- `RESINOS_TESTS_DEVICE_TYPE`: the device type to test, like `raspberrypi3`
- `RESINOS_TESTS_EMAIL`: the email of the test account
- `RESINOS_TESTS_PASSWORD`: the password of the test account
- `RESINOS_TESTS_WIFI_SSID`: the wifi SSID the provisioned device should
  connect to
- `RESINOS_TESTS_WIFI_KEY`: the wifi key the provisioned device should use
- `RESINOS_TESTS_DISK`: the device that should be provisioned with resinOS
  (i.e. `/dev/disk3`)

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

```sh
npm run lint
```

License
-------

The project is licensed under the Apache 2.0 license.

[issues]: https://github.com/resin-io/resinos-tests/issues
[newissue]: https://github.com/resin-io/resinos-tests/issues/new
[source]: https://github.com/resin-io/resinos-tests
