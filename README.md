# Leviathan

[![Build Status (master)](https://jenkins.dev.resin.io/buildStatus/icon?job=balena-tests-master)](https://jenkins.dev.resin.io/job/balena-tests-master/)
[![GitHub Issues](https://img.shields.io/github/issues/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/balena-io/leviathan.svg)](https://github.com/balena-io/leviathan/pulls)
[![node](https://img.shields.io/badge/node-v9.0.0-green.svg)](https://nodejs.org/download/release/v9.0.0/)
[![License](https://img.shields.io/badge/license-APACHE%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> A distributed testing framework 

## Getting Started

Leviathan needs configuration of both hardware and software to set it up. If you are setting up your standalone testbot, then please follow the instructions given below carefully before running tests on the Device Under Test (DUT). 


**Clone the repository**

- Clone this repository with `git clone --recursive` or   
- Run `git clone` and then `git submodule update --init --recursive` to install submodules.


**Prerequistes needed**
  
  - Install node and npm in your system. We recommend installing [LTS versions from NVM](https://github.com/nvm-sh/nvm#install--update-script).
  - You would need access to balena's NPM registry.
  - Download the image you want to test on your DUT from [balena.io/os](balena.io/os)


**Configuration needed**

  - Start building your standalone testbot by [following the guide](). 
  - Add NPM auth token with read permission to [install private packages](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow#create-and-check-in-a-project-specific-npmrc-file).
  - Create your test configuration, by creating a `config.json` file in the `workspace` directory, following instructions mentioned in the [testbot docs](https://github.com/balena-io/testbot/).
  - Copy your downloaded balenaOS image inside the `workspace` directory.
  - Extract, rename and recompress the image into the `.gz` format. Final file would look like `balena.img.gz` file.


**Packages needed for installation**

(Taken from `Dockerfile.template` of each service, so might be incomplete or overkill)

1. First step is to install OS packages that are needed. 

```
sudo apt-get install qemu-kvm pkg-config libvirt-daemon-system bridge-utils libvirt-clients build-essential g++ python git make gcc gcc-multilib node-gyp libusb-dev libdbus-1-dev libvirt-dev qemu-system-x86
```

2. Install global NPM packages needed

```
npm install node-pre-gyp node-gyp -g
```

3. Install NPM packages. 

```
npm install
```

Make sure the `npm install` goes without errors (other than the optional dependencies), as it recursively installs packages for all 3 services. If it fails, you can follow the command below for troubleshooting. 


**Run the tests**

- Navigate to the workspace directory, 

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


## Instructions for rig-owners 

- If you are pushing new releases of Leviathan to balenaCloud, then place the `.npmrc` file over with NPM token at the location `leviathan/.balena/secrets/.npmrc`
- Next, create a [build time only secret file](https://www.balena.io/docs/learn/deploy/deployment/#build-time-secrets-and-variables), `.balena.yml` will be needed. Create a `balena.yml` in the `.balena` directory with the following configuration. 

```
build-secrets:
  services:
    worker:
      - source: .npmrc
        dest: .npmrc
```


**To push new release to balenaCloud**

- Run the command with the <appname> as the name of your application.

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
