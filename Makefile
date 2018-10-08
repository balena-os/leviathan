DOCKER_IMAGE = resinos-tests

ifndef CI
	DOCKER_TTY = '--tty'
	DOCKER_INTERACTIVE = '--interactive'
endif

ifdef RESINOS_TESTS_DISK
	DEVICE = '--device=$(RESINOS_TESTS_DISK)'
endif

build-docker-image: Dockerfile
	@echo '[Info] Building docker image "$(DOCKER_IMAGE)"...'
	@docker build --rm --tag $(DOCKER_IMAGE) .

test: build-docker-image
	@echo '[Info] Starting tests inside container...'
	@docker run --rm \
		--env "CI=$(CI)" \
		--env "GITHUB_TOKEN=$(GITHUB_TOKEN)" \
		--privileged \
		$(foreach variable, $(shell env | grep RESINOS), --env $(variable)) \
		$(DOCKER_TTY) \
		$(DOCKER_INTERACTIVE) \
		$(DEVICE) \
		$(DOCKER_IMAGE)

enter:
ifndef id
	@echo '[Error] Mandatory argument "id" not defined'
	@exit 1
endif
ifeq ("$(shell docker inspect -f '{{.State.Running}}' $(id) 2>/dev/null)","true")
	@echo '[Info] You are inside container "$(id)"'
	@docker exec -it $(id) bash
else
	@echo '[Error] Container "$(id)" is not running!'
	@exit 1
endif

code-check: build-docker-image
	@echo '[Info] Checking coding style...'
	@docker run --rm $(DOCKER_IMAGE) npm test

clean:
	@echo '[Info] Removing docker image "$(DOCKER_IMAGE)"...'
	@docker rmi $(DOCKER_IMAGE)

.PHONY: build-docker-image test enter code-check clean

.DEFAULT_GOAL = test
