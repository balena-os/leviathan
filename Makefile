SHELL = /bin/bash
ROOTDIR := $(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))

CLIENTDIR := ./client
COREDIR := ./core
WORKERDIR := ./worker

# required balena push args
PUSHTO ?= balena/testbot-personal
PUSHARGS ?=

# optional docker-compose args
BUILDARGS ?=
UPARGS ?= --force-recreate --remove-orphans

LOCALCOMPOSEFILE := docker-compose.local.yml
CLIENTCOMPOSEFILE := docker-compose.client.yml

export COMPOSE_FILE := $(LOCALCOMPOSEFILE):$(CLIENTCOMPOSEFILE)
export COMPOSE_DOCKER_CLI_BUILD ?= 1
export DOCKER_BUILDKIT ?= 1
export DOCKERD_EXTRA_ARGS ?=

# override these in make command (eg. make local-test SUITES=/path/to/suites)
export WORKSPACE
export REPORTS
export SUITES

# use this target to force real targets to be recreated
.PHONY: .FORCE
.FORCE:

DOCKERCOMPOSE := $(shell command -v docker-compose 2>/dev/null || echo ./bin/docker-compose)
YQ := $(shell command -v yq 2>/dev/null || echo ./bin/yq)

# install docker-compose as a run script if binary not in path
$(DOCKERCOMPOSE):
	mkdir -p $(shell dirname "$@")
	curl -fsSL "https://github.com/docker/compose/releases/download/1.29.2/run.sh" -o $@
	chmod +x $@

$(YQ):
	mkdir -p $(shell dirname "$@")
	curl -fsSL "https://github.com/mikefarah/yq/releases/download/v4.16.1/yq_linux_amd64" -o $@
	chmod +x $@

.NOTPARALLEL: $(DOCKERCOMPOSE) $(YQ)

# create a dockerfile from dockerfile.template
%/Dockerfile:: %/Dockerfile.template .FORCE
ifneq ($(shell command -v npx 2>/dev/null),)
	npm_config_yes=true npx dockerfile-template -d BALENA_ARCH="amd64" -f $< > $@
else
	sed 's/%%BALENA_ARCH%%/amd64/g' $< > $@
endif

help: ## Print help message
	@echo -e "$$(grep -hE '^\S+:.*##' $(MAKEFILE_LIST) | sed -e 's/:.*##\s*/:/' -e 's/^\(.\+\):\(.*\)/\\x1b[36m\1\\x1b[m:\2/' | column -c2 -t -s :)"

config: $(DOCKERCOMPOSE) ## Print flattened docker-compose definition
	$(DOCKERCOMPOSE) config

build: $(DOCKERCOMPOSE) $(COREDIR)/Dockerfile $(WORKERDIR)/Dockerfile ## Build the core, worker, and client images
	$(DOCKERCOMPOSE) build $(BUILDARGS)

core: $(DOCKERCOMPOSE) $(COREDIR)/Dockerfile ## Build the core image only
	$(DOCKERCOMPOSE) build $(BUILDARGS) $@

worker: $(DOCKERCOMPOSE) $(WORKERDIR)/Dockerfile ## Build the worker image only
	$(DOCKERCOMPOSE) build $(BUILDARGS) $@

client: $(DOCKERCOMPOSE) ## Build the client image only
	$(DOCKERCOMPOSE) build $(BUILDARGS) $@

clean: ## Clean locally generated Dockerfiles
	-@rm -f $(COREDIR)/Dockerfile
	-@rm -f $(WORKERDIR)/Dockerfile

test: $(DOCKERCOMPOSE) client ## Run the client only and connect to an existing worker
	$(DOCKERCOMPOSE) up $(UPARGS) client

local-test: $(DOCKERCOMPOSE) core worker client ## Run local (QEMU) worker and client (streaming logs)
	$(DOCKERCOMPOSE) up $(UPARGS) --abort-on-container-exit

local: $(DOCKERCOMPOSE) core worker ## Run local (QEMU) worker in attached mode (streaming logs)
	$(DOCKERCOMPOSE) up $(UPARGS) --scale client=0

detached: $(DOCKERCOMPOSE) core worker ## Run local (QEMU) worker in detached mode
	$(DOCKERCOMPOSE) up $(UPARGS) --scale client=0 --detach

stop: $(DOCKERCOMPOSE) ## Stop and remove any existing containers and volumes
	$(DOCKERCOMPOSE) down --remove-orphans --rmi all --volumes

down: stop ## Alias for stop

push: clean ## Push a release to a fleet or local mode device (eg. PUSHTO=balena.local)
	balena push $(PUSHTO) $(PUSHARGS)

draft: ## Push a draft release to a fleet (eg. PUSHTO=balena/testbot-personal)
	balena push $(PUSHTO) $(PUSHARGS) --draft

release: push ## Alias for push

.PHONY: help config build core worker client clean test local local-test detached stop down push release draft

.DEFAULT_GOAL = local-test
