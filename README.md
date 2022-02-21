# Leviathan

[![GitHub Issues](https://img.shields.io/github/issues/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/pulls)
[![node](https://img.shields.io/badge/node-v12.0.0-green.svg)](https://nodejs.org/download/release/v12.0.0/)
[![License](https://img.shields.io/badge/license-APACHE%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)  [![balena deploy button](https://www.balena.io/deploy.svg)](https://dashboard.balena-cloud.com/deploy?repoUrl=https://github.com/balena-os/leviathan)

> A distributed testing system for hardware devices

Leviathan can be used to automate, test and control real/virtual devices in production or controlled environments. What can you do:

1. Stress testing the provisioning process on boards for reliablity, performance & fault tolerance.
2. Testing new versions of the OS on different board revisions, prod/staging environements, wifi/eth0 connectivity.
3. Automating release deployment on fleets by testing codebase on real/virtual devices under test.
4. Automating support for new modems, sensors, interfaces and eventually covering custom device support.

## Getting Started

Leviathan allows for running tests on a device controlled by a worker. A worker is a component on which your tests actually runs. It can be both real hardware or virtualised environments. Leviathan is designed to work with multiple workers. At the moment, leviathan supports [testbot][quickstart-testbot] and [qemu][quickstart-qemu] workers.

### Clone the repository

- Clone this repository with `git clone --recursive` or
- Run `git clone` and then `git submodule update --init --recursive` to install submodules.

### Prerequisites needed

- Install Docker, node and npm in your system. We recommend installing [LTS versions from NVM](https://github.com/nvm-sh/nvm#install--update-script).
- Download the balenaOS image you want to test on your DUT from [balena.io/os](https://balena.io/os#download).

### Worker setup

Leviathan allows for running tests either on a device under test (DUT) connected to and controlled by either a testbot worker, or on a virtualized device using the QEMU worker. Check out the following getting started guides to setup and run each type of worker.

1. [Testbot worker][quickstart-testbot]
   
2. [QEMU worker][quickstart-qemu]

## Instructions for rig-owners

To push a new release of leviathan to balenaCloud, use the following command:

```bash
balena push <appname>
```

## Documentation for Leviathan Helpers

Documentation for Leviathan helpers can be found on [https://balena-os.github.io/leviathan](https://balena-os.github.io/leviathan). To generate the documentation, run the following command from either the root of the repository or the `core` directory.

```bash
npm install
npm run docs
```

If the docs are generated successfully, you will be getting the success line as:

```bash
Info: Documentation generated at /path/to/documentation
```

## Support

If you're having any problem, please [raise an issue][newissue] on GitHub and the balena team will be happy to help.

## License

The project is licensed under the Apache 2.0 license.

[issues]: https://github.com/balena-io/leviathan/issues
[newissue]: https://github.com/balena-io/leviathan/issues/new
[source]: https://github.com/balena-io/leviathan
[quickstart-qemu]: https://balena-os.github.io/leviathan/pages/Getting-Started/quickstart-qemu.html
[quickstart-testbot]: https://balena-os.github.io/leviathan/pages/Getting-Started/quickstart-testbot.html
