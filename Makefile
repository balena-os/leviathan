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
PUSH ?= balena/testbot-personal

COMPOSEBIN := ./docker-compose

BALENACOMPOSEFILE := ./docker-compose.yml
LOCALCOMPOSEFILE := ./docker-compose.local.yml

.DEFAULT_GOAL = local-test

# create a docker-compose binary either as a link or a script
$(COMPOSEBIN):
ifneq ($(shell command -v docker-compose 2>/dev/null),)
	ln -sf $(shell command -v docker-compose 2>/dev/null) $@
else
	curl -fsSL "https://github.com/docker/compose/releases/download/1.29.2/run.sh" -o $@
	chmod +x $@
endif

# create the core dockerfile from the template
$(COREDIR)/Dockerfile:
	npm_config_yes=true npx dockerfile-template -d BALENA_ARCH="amd64" -f $@.template > $@

# create the worker dockerfile from the template
$(WORKERDIR)/Dockerfile:
	npm_config_yes=true npx dockerfile-template -d BALENA_ARCH="amd64" -f $@.template > $@

# populate local .env file if it doesn't exist
.env:
	@echo "WORKSPACE=$(WORKSPACE)" > $@
	@echo "REPORTS=$(REPORTS)" >> $@
	@echo "SUITES=$(SUITES)" >> $@

######## BUILD TARGETS ########
.PHONY: build core worker client clean
######## BUILD TARGETS ########

# build core, worker, and client images
build: clean core worker client

# build the core docker image
core: $(COMPOSEBIN) $(COREDIR)/Dockerfile .env
	$(COMPOSEBIN) -f $(LOCALCOMPOSEFILE) build $(ARGS) $@

# build the worker docker image
worker: $(COMPOSEBIN) $(WORKERDIR)/Dockerfile .env
	$(COMPOSEBIN) -f $(LOCALCOMPOSEFILE) build $(ARGS) $@

# build the client docker image
client: $(COMPOSEBIN) .env
	$(COMPOSEBIN) -f $(LOCALCOMPOSEFILE) build $(ARGS) $@

# clean locally generated files
clean:
	-@rm -f $(COREDIR)/Dockerfile
	-@rm -f $(WORKERDIR)/Dockerfile
	-@rm -f $(COMPOSEBIN)

######## RUN TARGETS ########
.PHONY: test local local-test detached stop down
######## RUN TARGETS ########

# run the client image including test suites, assumes testbot or existing worker
test: clean client
	$(COMPOSEBIN) -f $(LOCALCOMPOSEFILE) up $(ARGS) client

# run local core and worker for qemu device tests, streaming logs
local: clean core worker
	$(COMPOSEBIN) -f $(LOCALCOMPOSEFILE) up $(ARGS) core worker

# run local core, worker, and client w/ tests in a single stream of logs
local-test: clean core worker client
	$(COMPOSEBIN) -f $(LOCALCOMPOSEFILE) up $(ARGS) core worker client

# run local core and worker in detached mode, primarily for jenkins
detached: clean core worker
	$(COMPOSEBIN) -f $(LOCALCOMPOSEFILE) up $(ARGS) --detach core worker

# stop any existing core, worker, or client containers
stop: $(COMPOSEBIN)
	$(COMPOSEBIN) -f $(LOCALCOMPOSEFILE) down

# alias for stop
down: stop

######## PUSH TARGETS ########
.PHONY: push release draft
######## PUSH TARGETS ########

# push a release to a fleet or local mode device
push: clean
	balena push $(PUSH) $(ARGS)

# push a draft release to a fleet
draft:
	balena push $(PUSH) $(ARGS) --draft

# alias for push
release: push
