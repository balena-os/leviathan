
# if there is an .env file ensure the make args and env vars take priority
# and then import all vars from the file
ifneq (,$(wildcard .env))
include $(shell t=$$(mktemp) ; cat .env 2>/dev/null > $$t ; printenv >> $$t ; echo $$t)
endif

# export all variables to child processes by default
export

# optional docker-compose args
BUILDARGS := --progress=plain --parallel --pull --build-arg WORKER_VERSION --build-arg BALENA_ARCH
UPARGS := --force-recreate --remove-orphans

QEMUCOMPOSEFILE := docker-compose.qemu.yml
SECUREBOOTCOMPOSEFILE := docker-compose.secureboot.yml
CLIENTCOMPOSEFILE := docker-compose.client.yml

# only use the qemu compose file if worker type is qemu
ifeq ($(WORKER_TYPE),qemu)
COMPOSE_FILE := $(CLIENTCOMPOSEFILE):$(QEMUCOMPOSEFILE)
ifeq ($(QEMU_SECUREBOOT),1)
COMPOSE_FILE := $(COMPOSE_FILE):$(SECUREBOOTCOMPOSEFILE)
endif
else
COMPOSE_FILE := $(CLIENTCOMPOSEFILE)
endif

# for arm64 hosts we need to set the BALENA_ARCH to pull the correct balenalib worker image
ifeq ($(shell uname -m),aarch64)
BALENA_ARCH ?= aarch64
else ifeq ($(shell uname -m),arm64)
BALENA_ARCH ?= aarch64
else
BALENA_ARCH ?= amd64
endif

# for generic-aarch64 we need to set the qemu architecture
ifeq ($(DEVICE_TYPE),generic-aarch64)
QEMU_ARCH ?= aarch64
endif

COMPOSE_DOCKER_CLI_BUILD := 0
DOCKER_BUILDKIT := 0
DOCKERD_EXTRA_ARGS :=

# BUILD_TAG is a unique Jenkins environment variable
ifneq ($(BUILD_TAG),)
COMPOSE_PROJECT_NAME := $(BUILD_TAG)
endif

DOCKERCOMPOSE := ./bin/docker-compose

# install docker-compose as a run script
# we require a specific release version that correctly supports device_cgroup_rules for the qemu worker
# see https://github.com/docker/compose/issues/9059
$(DOCKERCOMPOSE):
	mkdir -p $(shell dirname "$@")
ifeq ($(shell uname -m),arm64)
	curl -fsSL "https://github.com/docker/compose/releases/download/v2.3.3/docker-compose-$(shell uname -s | tr '[:upper:]' '[:lower:]')-aarch64" -o $@
else
	curl -fsSL "https://github.com/docker/compose/releases/download/v2.3.3/docker-compose-$(shell uname -s | tr '[:upper:]' '[:lower:]')-$(shell uname -m)" -o $@
endif
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
	-$(DOCKERCOMPOSE) down --remove-orphans --rmi all --volumes

down: stop ## Alias for 'make stop'

clean: stop ## Alias for 'make stop'

.PHONY: help config build testbot qemu test local-test stop down clean

.DEFAULT_GOAL = help
