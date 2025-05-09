# if there is an .env file ensure the make args and env vars take priority
# and then import all vars from the file
ifneq (,$(wildcard .env))
include $(shell t=$$(mktemp) ; cat .env 2>/dev/null > $$t ; printenv >> $$t ; echo $$t)
endif

# export all variables to child processes by default
export

# optional docker-compose args
PULLARGS := --include-deps --policy=always
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

PROJECT_REF := $(shell jq -r '.version' package.json)
CORE_TAG ?= v$(PROJECT_REF)-core
CLIENT_TAG ?= v$(PROJECT_REF)-client

help: ## Print help message
	@echo -e "$$(grep -hE '^\S+:.*##' $(MAKEFILE_LIST) | sed -e 's/:.*##\s*/:/' -e 's/^\(.\+\):\(.*\)/\\x1b[36m\1\\x1b[m:\2/' | column -c2 -t -s :)"

printenv:
	@printenv

check-docker: ## Check that docker is running
	$(info Checking that docker is running...)
ifeq ($(shell docker info > /dev/null 2>&1; echo $$?),1)
	$(error docker is not running)
endif

check-compose: ## Check that docker compose is installed
	$(info Checking that docker compose is installed...)
ifeq ($(shell command -v $(DOCKER_COMPOSE) 2>/dev/null),)
	$(error docker compose is not installed)
endif

check-jq: ## Check that jq is installed
	$(info Checking that jq is installed...)
ifeq ($(shell command -v jq 2>/dev/null),)
	$(error jq is not installed)
endif

# https://github.com/docker/compose/issues/9059
# Extract and parse docker compose version
COMPOSE_VERSION_RAW := $(shell $(DOCKER_COMPOSE) version 2>/dev/null | awk '{print $$NF}' | head -1)
COMPOSE_VERSION_CLEAN := $(shell echo "$(COMPOSE_VERSION_RAW)" | sed 's/^v//' | sed 's/-.*//')
COMPOSE_VERSION_PARTS := $(subst ., ,$(COMPOSE_VERSION_CLEAN))
COMPOSE_MAJOR := $(word 1,$(COMPOSE_VERSION_PARTS))
COMPOSE_MINOR := $(word 2,$(COMPOSE_VERSION_PARTS))
COMPOSE_PATCH := $(word 3,$(COMPOSE_VERSION_PARTS))

check-compose-version: ## Check that docker compose 2.3.3 or later is installed
	$(info Detected docker compose version: $(COMPOSE_MAJOR).$(COMPOSE_MINOR).$(COMPOSE_PATCH))
ifeq ($(COMPOSE_MAJOR),)
	$(error Unable to detect docker compose version)
endif
ifeq ($(shell test $(COMPOSE_MAJOR) -lt 2; echo $$?),0)
	$(error Docker compose version must be 2.3.3 or later, found $(COMPOSE_MAJOR).$(COMPOSE_MINOR).$(COMPOSE_PATCH))
endif
ifeq ($(COMPOSE_MAJOR),2)
ifeq ($(shell test $(COMPOSE_MINOR) -lt 3; echo $$?),0)
	$(error Docker compose version must be 2.3.3 or later, found $(COMPOSE_MAJOR).$(COMPOSE_MINOR).$(COMPOSE_PATCH))
endif
ifeq ($(COMPOSE_MINOR),3)
ifeq ($(shell test $(COMPOSE_PATCH) -lt 3; echo $$?),0)
	$(error Docker compose version must be 2.3.3 or later, found $(COMPOSE_MAJOR).$(COMPOSE_MINOR).$(COMPOSE_PATCH))
endif
endif
endif

check-prereqs: check-docker check-compose check-compose-version check-jq

config: check-prereqs ## Print flattened docker-compose definition
	$(DOCKER_COMPOSE) config

pull: check-prereqs ## Pull the required images
	$(DOCKER_COMPOSE) pull $(PULLARGS)

build: check-prereqs ## Build the required images
	$(DOCKER_COMPOSE) build $(BUILDARGS)

test: ## Run the test suites
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

.PHONY: help check-prereqs check-compose check-docker config pull build testbot qemu test local-test stop down clean

.DEFAULT_GOAL = help
