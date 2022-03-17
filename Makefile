SHELL = /bin/bash
CLIENTDIR := ./client
COREDIR := ./core
WORKERDIR := ./worker

# import a local .env file if it exists
-include .env

# optional docker-compose args
BUILDARGS := --parallel
UPARGS := --force-recreate --remove-orphans --build

QEMUCOMPOSEFILE := docker-compose.qemu.yml
CLIENTCOMPOSEFILE := docker-compose.client.yml

# use both compose files by default, targets can override this with -f
export COMPOSE_FILE := $(CLIENTCOMPOSEFILE):$(QEMUCOMPOSEFILE)
export COMPOSE_DOCKER_CLI_BUILD := 1
export DOCKER_BUILDKIT := 1
export DOCKERD_EXTRA_ARGS :=

ifneq ($(BUILD_TAG),)
export COMPOSE_PROJECT := $(BUILD_TAG)
endif

DOCKERCOMPOSE := ./bin/docker-compose

# install docker-compose as a run script
$(DOCKERCOMPOSE):
	mkdir -p $(shell dirname "$@")
	curl -fsSL "https://github.com/docker/compose/releases/download/1.29.2/run.sh" -o $@
	chmod +x $@

.NOTPARALLEL: $(DOCKERCOMPOSE)

help: ## Print help message
	@echo -e "$$(grep -hE '^\S+:.*##' $(MAKEFILE_LIST) | sed -e 's/:.*##\s*/:/' -e 's/^\(.\+\):\(.*\)/\\x1b[36m\1\\x1b[m:\2/' | column -c2 -t -s :)"

config: $(DOCKERCOMPOSE) ## Print flattened docker-compose definition
	$(DOCKERCOMPOSE) config

build: $(DOCKERCOMPOSE) ## Build the core, worker, and client images
	$(DOCKERCOMPOSE) build $(BUILDARGS)

test: $(DOCKERCOMPOSE) ## Run the test suites (expects WORKER_TYPE to be set)
ifeq ($(WORKER_TYPE),qemu)
	$(DOCKERCOMPOSE) up $(UPARGS) --exit-code-from client
else
	$(DOCKERCOMPOSE) -f $(CLIENTCOMPOSEFILE) up $(UPARGS) --exit-code-from client
endif

local-test: ## Alias for 'make test WORKER_TYPE=qemu'
	$(MAKE) test WORKER_TYPE=qemu

qemu: ## Alias for 'make test WORKER_TYPE=qemu'
	$(MAKE) test WORKER_TYPE=qemu

testbot:## Alias for 'make test WORKER_TYPE=testbot'
	$(MAKE) test WORKER_TYPE=testbot

stop: $(DOCKERCOMPOSE) ## Stop and remove any existing containers and volumes
	$(DOCKERCOMPOSE) down --remove-orphans --rmi all --volumes

down: stop ## Alias for 'make stop'

.PHONY: help config build testbot qemu test local-test stop down

.DEFAULT_GOAL = help
