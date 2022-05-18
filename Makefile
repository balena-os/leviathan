SHELL = /bin/bash
CLIENTDIR := ./client
COREDIR := ./core
WORKERDIR := ./worker
ENV_FILE := .env

ifneq (,$(wildcard $(ENV_FILE)))
# if there is an .env file ensure the command line and env vars take priority
include $(shell t=$$(mktemp) ; cat $(ENV_FILE) 2>/dev/null > $$t ; printenv >> $$t ; echo $$t)
endif

# export all variables to child processes by default
export

# optional docker-compose args
BUILDARGS := --parallel --progress=plain
UPARGS := --force-recreate --remove-orphans

QEMUCOMPOSEFILE := docker-compose.qemu.yml
CLIENTCOMPOSEFILE := docker-compose.client.yml

# only use the qemu compose file if worker type is qemu
ifeq ($(WORKER_TYPE),qemu)
export COMPOSE_FILE := $(CLIENTCOMPOSEFILE):$(QEMUCOMPOSEFILE)
else
export COMPOSE_FILE := $(CLIENTCOMPOSEFILE)
endif

# for qemu workers we need to set the BALENA_ARCH to pull the correct balenalib image
ifeq ($(shell uname -m),aarch64)
export BALENA_ARCH ?= aarch64
export QEMU_ARCH ?= aarch64
else
export BALENA_ARCH ?= amd64
export QEMU_ARCH ?= x86_64
endif

export COMPOSE_DOCKER_CLI_BUILD := 1
export DOCKER_BUILDKIT := 1
export DOCKERD_EXTRA_ARGS :=

# BUILD_TAG is a unique Jenkins environment variable
ifneq ($(BUILD_TAG),)
export COMPOSE_PROJECT := $(BUILD_TAG)
endif

DOCKERCOMPOSE := ./bin/docker-compose

# install docker-compose as a run script
# we require a specific release version that correctly supports device_cgroup_rules for the qemu worker
# see https://github.com/docker/compose/issues/9059
$(DOCKERCOMPOSE):
	mkdir -p $(shell dirname "$@")
	curl -L "https://github.com/docker/compose/releases/download/v2.3.3/docker-compose-$(shell uname -s)-$(shell uname -m)" -o $@
	chmod +x $@

.NOTPARALLEL: $(DOCKERCOMPOSE)

help: ## Print help message
	@echo -e "$$(grep -hE '^\S+:.*##' $(MAKEFILE_LIST) | sed -e 's/:.*##\s*/:/' -e 's/^\(.\+\):\(.*\)/\\x1b[36m\1\\x1b[m:\2/' | column -c2 -t -s :)"

printenv:
	@printenv

config: $(DOCKERCOMPOSE) ## Print flattened docker-compose definition
	$(DOCKERCOMPOSE) config

build: $(DOCKERCOMPOSE) ## Build the required images
	$(DOCKERCOMPOSE) build $(BUILDARGS)

test: $(DOCKERCOMPOSE) build ## Run the test suites
	$(DOCKERCOMPOSE) up $(UPARGS) --exit-code-from client

local-test: ## Alias for 'make test WORKER_TYPE=qemu'
	$(MAKE) test WORKER_TYPE=qemu

qemu: ## Alias for 'make test WORKER_TYPE=qemu'
	$(MAKE) test WORKER_TYPE=qemu

testbot:## Alias for 'make test WORKER_TYPE=testbot'
	$(MAKE) test WORKER_TYPE=testbot

stop: $(DOCKERCOMPOSE) ## Stop and remove any existing containers and volumes
	$(DOCKERCOMPOSE) down --remove-orphans --rmi all --volumes

down: stop ## Alias for 'make stop'

clean: stop ## Alias for 'make stop'

.PHONY: help config build testbot qemu test local-test stop down clean

.DEFAULT_GOAL = help
