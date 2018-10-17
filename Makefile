SHELL = /bin/bash
DOCKER_IMAGE = resinos-tests

ifndef CI
	DOCKER_TTY = '--tty'
	DOCKER_INTERACTIVE = '--interactive'
endif

ifdef RESINOS_TESTS_DISK
	DEVICE = '--device=$(RESINOS_TESTS_DISK)'
endif

build-docker-image: Dockerfile
	$(info Building docker image "$(DOCKER_IMAGE)"...)
	@docker build --rm --tag $(DOCKER_IMAGE) .

test: build-docker-image
	$(info Starting tests inside container...)
	@docker run --rm \
		--env "CI=$(CI)" \
		--env "GITHUB_TOKEN=$(GITHUB_TOKEN)" \
		--privileged \
		$(foreach variable, $(shell compgen -e | grep RESINOS_TESTS), \
			--env "$(addsuffix =$(value $(variable)), $(variable))") \
		$(DOCKER_TTY) \
		$(DOCKER_INTERACTIVE) \
		$(DEVICE) \
		$(DOCKER_IMAGE)

enter:
ifndef id
	$(error Mandatory argument "id" not defined)
endif
ifeq ("$(shell docker inspect -f '{{.State.Running}}' $(id) 2>/dev/null)","true")
	$(info You are inside container "$(id)")
	@docker exec -it $(id) bash
else
	$(error Container "$(id)" is not running!)
endif

code-check: build-docker-image
	$(info Checking coding style...)
	@docker run --rm $(DOCKER_IMAGE) npm test

clean:
	$(info Removing docker image "$(DOCKER_IMAGE)"...)
	@docker rmi $(DOCKER_IMAGE)

.PHONY: build-docker-image test enter code-check clean

.DEFAULT_GOAL = test
