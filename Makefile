SHELL = /bin/bash
ROOTDIR := $(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))

CLIENTDIR := $(ROOTDIR)/client
COREDIR := $(ROOTDIR)/core
WORKERDIR := $(ROOTDIR)/worker

# override these in make command (eg. make local-test WORKSPACE=/path/to/workspace)
WORKSPACE ?= $(ROOTDIR)/workspace
REPORTS ?= $(ROOTDIR)/workspace/reports
SUITES ?= $(ROOTDIR)/suites

# override these in make command (eg. make release PUSH=192.168.1.100)
PUSHTO ?= balena/testbot-personal
PUSHARGS ?=

UPARGS ?= --force-recreate --remove-orphans
BUILDARGS ?=
DOCKERCOMPOSE ?= $(shell command -v docker-compose 2>/dev/null)

# docker-compose will automatically source this file
ENVFILE := .env

.DEFAULT_GOAL = local-test

export PATH := $(ROOTDIR)/bin:$(PATH)
export COMPOSE_FILE := docker-compose.local.yml
export DOCKER_BUILDKIT := 1
export COMPOSE_DOCKER_CLI_BUILD := 1

# install docker-compose as a run script if binary not in path
$(DOCKERCOMPOSE):
	mkdir -p bin
	curl -fsSL "https://github.com/docker/compose/releases/download/1.29.2/run.sh" -o bin/docker-compose
	chmod +x bin/docker-compose

# create a dockerfile from dockerfile.template
%/Dockerfile:: %/Dockerfile.template .FORCE
	npm_config_yes=true npx dockerfile-template -d BALENA_ARCH="amd64" -f $< > $@

# populate local env file if it doesn't exist
$(ENVFILE):
	@echo "WORKSPACE=$(WORKSPACE)" > $@
	@echo "REPORTS=$(REPORTS)" >> $@
	@echo "SUITES=$(SUITES)" >> $@

common: $(ENVFILE) $(DOCKERCOMPOSE)

# force dockerfiles to be regenerated
.PHONY: .FORCE
.FORCE:

######## BUILD TARGETS ########
.PHONY: build common core worker client clean
######## BUILD TARGETS ########

# build all images
build: common $(COREDIR)/Dockerfile $(WORKERDIR)/Dockerfile
	$(DOCKERCOMPOSE) build $(BUILDARGS)

# build the core docker image
core: common $(COREDIR)/Dockerfile
	$(DOCKERCOMPOSE) build $(BUILDARGS) $@

# build the worker docker image
worker: common $(WORKERDIR)/Dockerfile
	$(DOCKERCOMPOSE) build $(BUILDARGS) $@

# build the client docker image
client: common
	$(DOCKERCOMPOSE) build $(BUILDARGS) $@

# clean locally generated files
clean: common
	-$(DOCKERCOMPOSE) down --remove-orphans --rmi all --volumes
	-@rm -rf bin
	-@rm -f $(COREDIR)/Dockerfile
	-@rm -f $(WORKERDIR)/Dockerfile

######## RUN TARGETS ########
.PHONY: test local local-test detached stop down
.NOTPARALLEL: $(DOCKERCOMPOSE)
######## RUN TARGETS ########

# run the client image including test suites, assumes testbot or existing worker
test: common
	$(DOCKERCOMPOSE) up --build $(UPARGS) client

# run local core and worker for qemu device tests, streaming logs
local: common $(COREDIR)/Dockerfile $(WORKERDIR)/Dockerfile
	$(DOCKERCOMPOSE) up --build $(UPARGS) core worker

# run local core, worker, and client w/ tests in a single stream of logs
local-test: common $(COREDIR)/Dockerfile $(WORKERDIR)/Dockerfile
	$(DOCKERCOMPOSE) up --build $(UPARGS) core worker client

# run local core and worker in detached mode, primarily for jenkins
detached: common $(COREDIR)/Dockerfile $(WORKERDIR)/Dockerfile
	$(DOCKERCOMPOSE) up --build $(UPARGS) --detach core worker

# stop any existing core, worker, or client containers
stop: common
	$(DOCKERCOMPOSE) down

# alias for stop
down: stop

######## PUSH TARGETS ########
.PHONY: push release draft
######## PUSH TARGETS ########

# push a release to a fleet or local mode device
push: clean
	balena push $(PUSHTO) $(PUSHARGS)

# push a draft release to a fleet
draft:
	balena push $(PUSHTO) $(PUSHARGS) --draft

# alias for push
release: push
