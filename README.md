# Leviathan

[![Build Status (master)](https://jenkins.dev.resin.io/buildStatus/icon?job=balena-tests-master)](https://jenkins.dev.resin.io/job/balena-tests-master/)
[![GitHub Issues](https://img.shields.io/github/issues/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/pulls)
[![node](https://img.shields.io/badge/node-v9.0.0-green.svg)](https://nodejs.org/download/release/v9.0.0/)
[![License](https://img.shields.io/badge/license-APACHE%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> A distributed testing framework 

## Getting Started

Instructions for Linux Ubuntu 20.04 distribution.

**Clone**

- Clone this repository with `git clone --recursive` or   
- Run `git clone` and then `git submodule update --init --recursive`

**Configuration needed**

  - Install node and npm. LTS versions.  
  - NPM auth token with read permission atleast to install packages locally (`~/.npmrc`) and when pushing to BalenCloud (~/leviathan/.balena/.npmrc)
  - Create a `balena.yml` in the `.balena` directory to handle secrets only while pushing to BalenaCloud. 
  - `git submodule update --init --recursive` if not done at the time of cloning.
  - Create your configuration in the `workspace` directory for testing.
  - Put on your BalenaOS image for the device type you are testing with, and make sure the extension is `.img.gz` inside the `workspace` directory.
  
**Packages needed**

(Taken from `Dockerfile.template` of each service, might be incomplete)

```
sudo apt-get install qemu-kvm pkg-config libvirt-daemon-system bridge-utils libvirt-clients build-essential g++ python git make gcc gcc-multilib node-gyp libusb-dev libdbus-1-dev libvirt-dev qemu-system-x86
```

**Global NPM packages needed**

```
npm install node-pre-gyp node-gyp -g
```

## Helpful commands for troubleshooting

At times, when `npm install` leads to errors. Use the commands below before trying again to begin again with a clean slate.

```
rm core/package-lock.json worker/package-lock.json client/package-lock.json package-lock.json
rm -rf node_modules/ core/node_modules/ worker/node_modules/ client/node_modules/
rm -rf ~/.node-gyp
npm cache clear --force
```

The `npm install` should finish install without any errors if configured right 

## Pushing new release to BalenaCloud

After configuring Leviathan, run the command 

```
PUSH=<appname> make balena
```

## Support

If you're having any problem, please [raise an issue][newissue] on GitHub and the Balena team will be happy to help.

## Contribute

- Issue Tracker: [github.com/balena-io/balena-tests/issues][issues]
- Source Code: [github.com/balena-io/leviathan][source]

## License

The project is licensed under the Apache 2.0 license.

[issues]: https://github.com/balena-io/balena-tests/issues
[newissue]: https://github.com/balena-io/balena-tests/issues/new
[source]: https://github.com/balena-io/balena-tests
