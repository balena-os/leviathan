# Quick start guides

Leviathan allows for running tests on a device controlled by a worker. A worker is a component on which your tests actually runs. It can be both real hardware or virtualised environments. Leviathan is designed to work with multiple workers. 
### Clone the repository

- Clone this repository with `git clone --recursive` or
- Run `git clone` and then `git submodule update --init --recursive` to install submodules.

### Prerequisites 

- Install Docker, node and npm in your system. We recommend installing [LTS versions from NVM](https://github.com/nvm-sh/nvm#install--update-script).
- Download the balenaOS image you want to test on your DUT from [balena.io/os](https://balena.io/os#download).
  
## Worker setup

Leviathan allows for running tests on a device under test (DUT) connected to and controlled by either a testbot worker, or on a virtualized device using the QEMU worker. Check out the following getting started guides to setup and run each type of worker. Following are quick start guides into setting up each type of worker:

1. {@page Testbot worker | Testbot worker}
2. {@page QEMU worker | QEMU worker}