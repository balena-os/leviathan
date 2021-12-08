SHELL = /bin/bash
ROOTDIR := $(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))

CLIENTDIR := $(ROOTDIR)/client
COREDIR := $(ROOTDIR)/core
WORKERDIR := $(ROOTDIR)/worker

# override these in make command (eg. make release PUSH=192.168.1.100)
PUSHTO ?= balena/testbot-personal
PUSHARGS ?=

UPARGS ?= --force-recreate
BUILDARGS ?=

DOCKERCOMPOSE := $(shell command -v docker-compose 2>/dev/null || echo ./bin/docker-compose)
YQ := $(shell command -v yq 2>/dev/null || echo ./bin/yq)

.DEFAULT_GOAL = local-test

# BUILD_TAG is set by Jenkins, unset for local
# BUILD_TAG ?= leviathan
# LOWERPORT ?= 5000
# UPPERPORT ?= 6000
INSTANCES ?= 3
# PREFIX ?=

# PORTS ?= $(shell ./getports.sh $(LOWERPORT) $(UPPERPORT) $$(( $(INSTANCES) * 2)))

CORE_PORT ?= 80
WORKER_PORT ?= 2000
# PREFIX ?= KEY_

# YQEXPRESSION := '\
# 	(.services, .volumes) |= with_entries(.key |= "$(PREFIX)" + .) | \
# 	.services[].volumes[] |= sub("(.+)","$(PREFIX)$${1}") | \
# 	.services[].environment.CORE_PORT = "$(CORE_PORT)" | \
# 	.services[].environment.WORKER_PORT = "$(WORKER_PORT)" \
# 	'

YQEXPRESSION := '\
	(.services, .volumes) |= with_entries(.key |= . + "$(SUFFIX)") | \
	.services[].volumes[] |= sub("(^[^:]+):","$${1}$(SUFFIX):") | \
	.services[].environment.CORE_PORT = "$(CORE_PORT)" | \
	.services[].environment.WORKER_PORT = "$(WORKER_PORT)" \
	'

CORES := core core_2 core_3
WORKERS := worker worker_2 worker_3

# export COMPOSE_PROJECT_NAME := $(PREFIX)
export COMPOSE_FILE := docker-compose.yml:docker-compose.local.yml

export COMPOSE_DOCKER_CLI_BUILD ?= 1
export DOCKER_BUILDKIT ?= 1
export DOCKERD_EXTRA_ARGS ?=

# override these in make command (eg. make local-test WORKSPACE=/path/to/workspace)
export WORKSPACE
export REPORTS
export SUITES

# install docker-compose as a run script if binary not in path
$(DOCKERCOMPOSE):
	mkdir -p $(shell dirname "$@")
	curl -fsSL "https://github.com/docker/compose/releases/download/1.29.2/run.sh" -o $@
	chmod +x $@

$(YQ):
	mkdir -p $(shell dirname "$@")
	curl -fsSL "https://github.com/mikefarah/yq/releases/download/v4.16.1/yq_linux_amd64" -o $@
	chmod +x $@

# create a dockerfile from dockerfile.template
%/Dockerfile:: %/Dockerfile.template .FORCE
	npm_config_yes=true npx dockerfile-template -d BALENA_ARCH="amd64" -f $< > $@

docker-compose.%.yml:: $(DOCKERCOMPOSE) .FORCE
	@$(DOCKERCOMPOSE) config | $(YQ) e $(YQEXPRESSION) - > $@

common: $(DOCKERCOMPOSE)

config: $(DOCKERCOMPOSE)
	$(DOCKERCOMPOSE) config

stack:
	for i in $(shell seq 1 $(INSTANCES)) ; \
	do \
		make docker-compose.$${i}.yml SUFFIX="-$${i}" CORE_PORT=$$(( $(CORE_PORT) + $${i} )) WORKER_PORT=$$(( $(WORKER_PORT) + $${i} )) ; \
	done
	COMPOSE_FILE=$$(ls -1 docker-compose.?.yml | xargs -d '\n' | tr ' ' ':') $(DOCKERCOMPOSE) config > docker-compose.$@.yml
	rm docker-compose.?.yml

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
	COMPOSE_FILE=docker-compose.client.yml $(DOCKERCOMPOSE) build $(BUILDARGS) $@

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
test: client
	COMPOSE_FILE=docker-compose.client.yml $(DOCKERCOMPOSE) up $(UPARGS) client

# run local core and worker for qemu device tests, streaming logs
local: core worker
	$(DOCKERCOMPOSE) up $(UPARGS)

# run local core, worker, and client w/ tests in a single stream of logs
local-test: core worker client
	COMPOSE_FILE=$(COMPOSE_FILE):docker-compose.client.yml $(DOCKERCOMPOSE) up $(UPARGS)

# run local core and worker in detached mode, primarily for jenkins
detached: core worker
	$(DOCKERCOMPOSE) up $(UPARGS) --detach

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
