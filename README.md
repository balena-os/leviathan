# ResinOS Automated Testing

Automated testing of OS images.

## Technology preview

The project aims to make it easy to do automated testing of OS images. This test framework is based on [AVA](https://github.com/avajs/ava), a feature-rich JavaScript test framework running on [Node.js](https://nodejs.org/en/) and in the browser, making asynchronous testing simple and fun. Even though JavaScript is single-threaded, IO in Node.js can happen in parallel due to its async nature. AVA takes advantage of this and runs your tests concurrently, which is especially beneficial for IO heavy tests. In addition, test files are run in parallel as separate processes, giving you even better performance and an isolated environment for each test file.

## Getting Started

### Prerequisites

- [Git](https://git-scm.com)
- [Docker](https://docs.docker.com/engine/installation/)

### Clone this repo and change your directory to it

```sh
$ git clone https://github.com/resin-io/resinos-tests.git && cd resinos-tests
```

### Configure environment variables

* Create a `env.list` and modify all the environment variables needed to run the tests - Please check `env.list.example` for a sample environment file.

```sh
cp env.list.example env.list
```

    * **WARNING!** The application name needs to be unique as the test suite will delete any existing application.

### Execute the following to run test

```sh
$ make
```

## Support

If you're having any problem, please [raise an issue](https://github.com/resin-io/resinos-tests/issues/new) on GitHub and the Resin.io team will be happy to help.

## Versioning

We use [Versionist](https://github.com/resin-io/versionist) for versioning.

## Contribute

* Issue Tracker: https://github.com/resin-io/resinos-tests/issues
* Source Code: https://github.com/resin-io/resinos-tests

## Licence

The project is licensed under the Apache 2.0 license.
