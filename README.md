# Leviathan

[![GitHub Issues](https://img.shields.io/github/issues/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/pulls)
[![node](https://img.shields.io/badge/node-v9.0.0-green.svg)](https://nodejs.org/download/release/v9.0.0/)
[![License](https://img.shields.io/badge/license-APACHE%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> A distributed testing framework 

## Getting Started

To set up Leviathan both hardware and software need to be configured. If you are setting up your standalone testbot, then please follow the instructions given below carefully before running tests on the Device Under Test (DUT). 


### Clone the repository

- Clone this repository with `git clone --recursive` or   
- Run `git clone` and then `git submodule update --init --recursive` to install submodules.


### Prerequisites needed

- Install node and npm in your system. We recommend installing [LTS versions from NVM](https://github.com/nvm-sh/nvm#install--update-script).
- Download the image you want to test on your DUT from [balena.io/os](balena.io/os)


### Configuration needed

- Start building your standalone testbot by [following the guide](https://github.com/balena-io/testbot/blob/master/documentation/getting-started.md#quick-start-guide-for-testbot). 
- Create your test configuration, by creating a `config.json` file in the `workspace` directory, following instructions mentioned in the [testbot docs](https://github.com/balena-io/testbot/blob/master/documentation/getting-started.md#run-your-first-test).
- Move the image zip file you want to test with inside the `workspace` directory in Leviathan.
- Extract the image, rename it to balena.img, and recompress the image into the `.gz` format. The final file would look like `balena.img.gz` file and has to be in the `./leviathan/workspace` directory. 


### Packages needed for installation

(Taken from `Dockerfile.template` of each service, so might be incomplete or properly overkill)

1. Install OS packages

```
sudo apt-get install qemu-kvm pkg-config libvirt-daemon-system bridge-utils libvirt-clients build-essential g++ python git make gcc gcc-multilib node-gyp libusb-dev libdbus-1-dev libvirt-dev qemu-system-x86
```

2. Install NPM packages

```
npm install node-pre-gyp node-gyp -g
npm install
```

Make sure the `npm install` goes without errors (other than the optional dependencies), as it recursively installs packages for all 3 services. If it fails, you can follow the commands below for troubleshooting. 


3. Run the tests by navigating to the workspace directory and running 

```
./run-tests.sh
```

## Helpful commands for troubleshooting

At times, when `npm install` leads to errors. Use the commands below before trying again to start with a clean slate.

```
rm core/package-lock.json worker/package-lock.json client/package-lock.json package-lock.json
rm -rf node_modules/ core/node_modules/ worker/node_modules/ client/node_modules/
rm -rf ~/.node-gyp
npm cache clear --force
```

## [Not Needed] Instructions for rig-owners 

- If you are pushing new releases of Leviathan to balenaCloud, then place the `.npmrc` file over with NPM token at the location `leviathan/.balena/secrets/.npmrc`
- Next, create a [build time only secret file](https://www.balena.io/docs/learn/deploy/deployment/#build-time-secrets-and-variables), `.balena.yml` will be needed. Create a `balena.yml` in the `.balena` directory with the following configuration. 

```
build-secrets:
  services:
    worker:
      - source: .npmrc
        dest: .npmrc
```

**To push a new release to balenaCloud**

- Run the command with the <appname> as the name of your application.

```
balena push <appname>
```

To monitior leviathan tests connected to its pipeline for the rigs, you would need to request Jenkins access.

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
