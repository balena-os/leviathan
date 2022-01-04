# Leviathan

[![GitHub Issues](https://img.shields.io/github/issues/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/pulls)
[![node](https://img.shields.io/badge/node-v12.0.0-green.svg)](https://nodejs.org/download/release/v12.0.0/)
[![License](https://img.shields.io/badge/license-APACHE%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

[![balena deploy button](https://www.balena.io/deploy.svg)](https://dashboard.balena-cloud.com/deploy?repoUrl=https://github.com/balena-os/leviathan)

> A distributed testing framework for hardware

## Getting Started

Leviathan allows for running tests either on a device connected to and controlled by a testbot rig, or on a virtualized QEMU worker. The instructions provided will get you started.

### Clone the repository

- Clone this repository with `git clone --recursive` or
- Run `git clone` and then `git submodule update --init --recursive` to install submodules.

### Prerequisites needed

- Install Docker, node and npm in your system. We recommend installing [LTS versions from NVM](https://github.com/nvm-sh/nvm#install--update-script).
- Download the balenaOS image you want to test on your DUT from [balena.io/os](https://balena.io/os#download).

### Worker setup

A worker is a component on which your tests actually runs. It can be both real hardware or virtualised environments. Leviathan is designed to work with multiple workers. Following are detailed instructions on how to setup each type of worker:
#### Testbot setup

Start with building your standalone testbot by [following the guide](https://github.com/balena-io-hardware/testbot-hardware/blob/master/documentation/getting-started.md#quick-start-guide-for-testbot).

#### QEMU

Run `make local` to build the core and worker services and run the worker using docker-compose.
Worker configuration variables can be specified in `docker-compose.local.yml`, under `environment`.
The default configuration should suffice in most cases.

| Variable            | Description                                         |
| -----------         | --------------------------------------------------- |
| QEMU_ARCH           | Architecture to virtualize (default: x86_64)        |
| QEMU_CPUS           | Number of CPUs to virtualize (default: 4)           |
| QEMU_MEMORY         | Amount of memory to virtualize (default: 2G)        |
| QEMU_BRIDGE_NAME    | Name of bridge to use for networking (default: br0) |
| QEMU_BRIDGE_ADDRESS | IP address to assign to bridge                      |
| QEMU_DHCP_RANGE     | Range of DHCP addresses to hand out to workers      |

### Configuration

To run the tests, you need to specify the configuration of the worker.

- Create your test configuration by creating a `config.json` file in the `workspace` directory.Follow the instructions mentioned in the [leviathan docs](https://github.com/balena-os/leviathan/blob/master/documentation/quickstart.md) to build your `config.json` file. 
  
> For QEMU workers, use localhost (`http://localhost`) instead of the `*.local` address for the `workers` property in the config.json file.
  
- Extract the image you want to test to `./leviathan/workspace` and rename it to `balena.img`.

### Running tests

Run the tests by navigating to the project directory and running

```bash
make test
```

On first run, it will build the client (one-time process) and start the tests. 

## Instructions for rig-owners

To push a new release to balenaCloud, run `npm install` and then push to the balenaCloud application.

```bash
npm install
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

## Contribute

- Issue Tracker: [github.com/balena-io/leviathan/issues][issues]
- Source Code: [github.com/balena-io/leviathan][source]

## License

The project is licensed under the Apache 2.0 license.

[issues]: https://github.com/balena-io/leviathan/issues
[newissue]: https://github.com/balena-io/leviathan/issues/new
[source]: https://github.com/balena-io/leviathan
