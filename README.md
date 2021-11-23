# Leviathan

[![GitHub Issues](https://img.shields.io/github/issues/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/pulls)
[![node](https://img.shields.io/badge/node-v9.0.0-green.svg)](https://nodejs.org/download/release/v9.0.0/)
[![License](https://img.shields.io/badge/license-APACHE%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> A distributed testing framework for hardware

## Getting Started

Leviathan allows for running tests either on a device connected to and controlled by a testbot rig, or on a virtualized QEMU worker. The below instructions provide a quick reference to get started.

### Clone the repository

- Clone this repository with `git clone --recursive` or
- Run `git clone` and then `git submodule update --init --recursive` to install submodules.

### Prerequisites needed

- Install node and npm in your system. We recommend installing [LTS versions from NVM](https://github.com/nvm-sh/nvm#install--update-script).
- Download the image you want to test on your DUT from [balena.io/os](https://balena.io/os#download).

### Worker setup
#### Testbot

Start building your standalone testbot by [following the guide](https://github.com/balena-io/testbot/blob/master/documentation/getting-started.md#quick-start-guide-for-testbot).

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

#### Configuration

- Create your test configuration, by creating a `config.json` file in the `workspace` directory, following instructions mentioned in the [leviathan docs](https://github.com/balena-os/leviathan/blob/master/documentation/quickstart.md). For QEMU workers, use localhost instead of the `*.local` address.
- Extract the image you want to test to `./leviathan/workspace` and rename it to `balena.img`
- Optionally provide a custom suites path by creating `client/.env` containing `SUITES=/my/custom/path/to/suites`. The default path is the suites dir in the root of the project.

### Running tests

Run the tests by navigating to the project directory and running

```bash
make test
```

## Instructions for rig-owners

To push a new release to balenaCloud, run `npm install` and then push to the balenaCloud application.

```bash
npm install
balena push <appname>
```

To monitior leviathan tests connected to its pipeline for the rigs, you would need to request Jenkins access.

## Documentation for Leviathan Helpers

Documentation for Leviathan helpers can be found on https://balena-os.github.io/leviathan
To generate the documentation, run the following command from either the root of the repository or the `core` directory.

```bash
npm install
npm run docs
```

If the docs are generated successfully, you will be getting the success line as:

```bash
Info: Documentation generated at /path/to/documentation
```

Head there to find the documentation by double clicking the index.html page

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
