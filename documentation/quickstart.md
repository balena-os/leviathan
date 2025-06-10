---
title: quickstart
category: Getting Started
children:
    - ../documentation/quickstart-autokit.md
    - ../documentation/quickstart-qemu.md
    - ../documentation/quickstart-testbot.md
---

# Quick start guides

Leviathan allows for running tests on a device controlled by a worker. A worker is a component on which your tests actually runs. It can be both real hardware or virtualised environments. Leviathan is designed to work with multiple workers. 
### Clone the repository

- Clone this repository with `git clone --recursive` or
- Run `git clone` and then `git submodule update --init --recursive` to install submodules.

### Prerequisites 

- Install Docker, node and npm in your system. We recommend installing [LTS versions from NVM](https://github.com/nvm-sh/nvm#install--update-script).
- After installing Docker, do follow the post-installation steps listed to [manage Docker as a non-root user](https://docs.docker.com/engine/install/linux-postinstall/#manage-docker-as-a-non-root-user).
- Download the balenaOS image you want to test on your DUT from [balena.io/os](https://balena.io/os#download).
  
## Worker setup

Select which type of worker you want to use:

1. [Autokit worker](quickstart-autokit.md) - Connect an actual device to your autokit and test on it
2. [QEMU worker](quickstart-qemu.md) - Create a virtual device and run tests on that.
3. [Testbot worker](quickstart-testbot.md) - Connect an actual device to your testbot and test on it