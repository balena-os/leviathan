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

ifeq ($(shell command -v docker-compose),)
DOCKER_COMPOSE := $(shell command -v docker 2>&1) compose
else
DOCKER_COMPOSE := $(shell command -v docker-compose 2>&1)
endif

help: ## Print help message
	@echo -e "$$(grep -hE '^\S+:.*##' $(MAKEFILE_LIST) | sed -e 's/:.*##\s*/:/' -e 's/^\(.\+\):\(.*\)/\\x1b[36m\1\\x1b[m:\2/' | column -c2 -t -s :)"

printenv:
	@printenv

check-docker: ## Check that docker is running
	@docker info > /dev/null 2>&1

# https://github.com/docker/compose/issues/9059
check-compose: ## Check that docker compose 2.3.3 or later is installed
	@$(DOCKER_COMPOSE) version | awk '{ \
		version = $$NF; \
		sub(/^v/, "", version); \
		sub(/-.*$$/, "", version); \
		split(version, ver, "."); \
		major = ver[1]; \
		minor = ver[2]; \
		patch = ver[3]; \
		print "INFO: Detected docker compose version " major "." minor "." patch; \
		if (major != 2 || (minor > 3 || (minor == 3 && patch >= 3))) { \
			exit 0; \
		} else { \
			print "Error: docker compose version must be 2.3.3 or later"; \
			exit 1; \
		} \
	}'

check-prereqs: check-docker check-compose

config: check-prereqs ## Print flattened docker-compose definition
	$(DOCKER_COMPOSE) config

build: check-prereqs ## Build the required images
	$(DOCKER_COMPOSE) build $(BUILDARGS)

test: build ## Run the test suites
	$(DOCKER_COMPOSE) up $(UPARGS) --exit-code-from client

local-test: ## Alias for 'make test WORKER_TYPE=qemu'
	$(MAKE) test WORKER_TYPE=qemu

qemu: ## Alias for 'make test WORKER_TYPE=qemu'
	$(MAKE) test WORKER_TYPE=qemu

testbot:## Alias for 'make test WORKER_TYPE=testbot'
	$(MAKE) test WORKER_TYPE=testbot

stop: check-prereqs ## Stop and remove any existing containers and volumes
	$(DOCKER_COMPOSE) down --remove-orphans --rmi all --volumes

down: stop ## Alias for 'make stop'

clean: stop ## Alias for 'make stop'

.PHONY: help config build testbot qemu test local-test stop down clean

.DEFAULT_GOAL = help
