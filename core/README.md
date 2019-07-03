# Leviathan

[![Build Status (master)](https://jenkins.dev.resin.io/buildStatus/icon?job=balena-tests-master)](https://jenkins.dev.resin.io/job/balena-tests-master/)
[![GitHub Issues](https://img.shields.io/github/issues/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/pulls)
[![node](https://img.shields.io/badge/node-v9.0.0-green.svg)](https://nodejs.org/download/release/v9.0.0/)
[![License](https://img.shields.io/badge/license-APACHE%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> A testing framework with an emphasis on hardware

## Getting Started

Firstly one would need to define the configuration of the framework.
The user has access to two type of configuration: framework wide (which Leviathan defines) and suite wide (defined by the user himself).
We provide the following framework wide configurations:

    BALENA_TESTS_DEVICE_TYPE: Device type that is to be tested
    BALENA_TESTS_TMPDIR: Framework's work directory
    BALENA_TESTS_ENABLE_INTERACTIVE_TESTS: Set to true if you want to run manual tests
    BALENA_TESTS_REPL_ON_FAILURE: Drop the framework in a REPL interface for diagnosis only in the case of a failure
    BALENA_TESTS_SUITE_NAME: Name of the suite to run
    BALENA_TESTS_SUITES_PATH: Where are suites defined

In case you run this framework inside a docker container (which we highly recommend) a few extra bit can be configured:

    CI: Puts the runner in continuous integration mode
    IMAGES: A directory that will be bind mounted inside the container, to gain access to OS images or other resources.

The suite wide configuration would be provided by the user-defined suite, Leviathan defines an example suite: `e2e`. The configuration available for this suite can be found in [e2e.conf.js](https://github.com/balena-io/leviathan/blob/master/suites/e2e/e2e.conf.js)

Currently also these configuration have to be define as environemnt variables to the node process, e.g.

    export BALENA_TESTS_DEVICE_TYPE = raspberrypi3

After the environment is all up, run

    make

And everything should start running (in a docker container).

If you would like to not run in a docker container, run

    npm start

## Example

```
export BALENA_TESTS_API_KEY=${API_KEY}
export BALENA_TESTS_DEVICE_TYPE=raspberrypi3
export BALENA_TESTS_TMPDIR=/tmp
export BALENA_TESTS_API_URL=balena-cloud.com
export BALENA_TESTS_NETWORK=wifi
export BALENA_TESTS_WIFI_KEY=${PSK}
export BALENA_TESTS_WORKER=remote
export BALENA_TESTS_DEVICE=https://${UUID}.balena-devices.com

export BALENA_TESTS_DOWNLOAD_TYPE=local
export BALENA_TESTS_DOWNLOAD_SOURCE=balena.img
export IMAGES="${HOME}/images"

export BALENA_TESTS_SUITES_PATH="./suites"
export BALENA_TESTS_SUITE_NAME="e2e"

make

```

## Support

If you're having any problem, please [raise an issue][newissue] on GitHub and
the Balena team will be happy to help.

## Contribute

- Issue Tracker: [github.com/balena-io/balena-tests/issues][issues]
- Source Code: [github.com/balena-io/leviathan][source]

## License

The project is licensed under the Apache 2.0 license.

[issues]: https://github.com/balena-io/balena-tests/issues
[newissue]: https://github.com/balena-io/balena-tests/issues/new
[source]: https://github.com/balena-io/balena-tests
