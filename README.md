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
- Run `git clone` and then `git submodule update --init --recursive` to install submodules.

**Configuration needed**

  - Install node and npm in your system. LTS versions recommended.  
  - Add NPM auth token with read permission to [install private packages](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow#create-and-check-in-a-project-specific-npmrc-file) locally in your system (in a `~/.npmrc` located in home directory). If pushing to balenaCloud, then place the `.npmrc` file over at `<cloned_repo>/.balena/secrets/.npmrc`
  - If pushing new release to balenaCloud, then a [Build Time only Secret File](https://www.balena.io/docs/learn/deploy/deployment/#build-time-secrets-and-variables) `.balena.yml` will be needed. Create a `balena.yml` in the `.balena` directory. 
  - Don't forget to install submodules with `git submodule update --init --recursive`
  - Create your configuration `config.json` in the `workspace` directory for testing with instructions mentioned in [testbot repository](https://github.com/balena-io/testbot/).
  - Place the balenaOS image for the deviceType you are testing with, and make sure the extension is `.img.gz` inside the `workspace` directory.
  
**Packages needed for installation**

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

## Pushing new release to balenaCloud

After configuring Leviathan, run the command 

```
PUSH=<appname> make balena
```

## Support

If you're having any problem, please [raise an issue][newissue] on GitHub and the balena team will be happy to help.

## Contribute

- Issue Tracker: [github.com/balena-io/balena-tests/issues][issues]
- Source Code: [github.com/balena-io/leviathan][source]

## License

The project is licensed under the Apache 2.0 license.

[issues]: https://github.com/balena-io/balena-tests/issues
[newissue]: https://github.com/balena-io/balena-tests/issues/new
[source]: https://github.com/balena-io/balena-tests
