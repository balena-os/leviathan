DOCKER_IMAGE = resinos-tests

build-docker-image: Dockerfile
	@echo '[Info] Building docker image "$(DOCKER_IMAGE)"...'
	@docker build -t $(DOCKER_IMAGE) .

test: build-docker-image
	@echo '[Info] Starting tests inside container...'
	@docker run -it --rm --name ${DOCKER_IMAGE} \
		--env "CI=$(CI)" \
		--env "RESINOS_TESTS_RESINOS_VERSION=$(RESINOS_TESTS_RESINOS_VERSION)" \
		--env "RESINOS_TESTS_APPLICATION_NAME_PREFIX=$(RESINOS_TESTS_APPLICATION_NAME_PREFIX)" \
		--env "RESINOS_TESTS_DEVICE_TYPE=$(RESINOS_TESTS_DEVICE_TYPE)" \
		--env "RESINOS_TESTS_EMAIL=$(RESINOS_TESTS_EMAIL)" \
		--env "RESINOS_TESTS_PASSWORD=$(RESINOS_TESTS_PASSWORD)" \
		--env "RESINOS_TESTS_WIFI_SSID=$(RESINOS_TESTS_WIFI_SSID)" \
		--env "RESINOS_TESTS_WIFI_KEY=$(RESINOS_TESTS_WIFI_KEY)" \
		--env "RESINOS_TESTS_DISK=$(RESINOS_TESTS_DISK)" \
		--env "RESINOS_TESTS_TMPDIR=$(RESINOS_TESTS_TMPDIR)" \
		$(DOCKER_IMAGE)

enter:
ifeq ("$(shell docker inspect -f '{{.State.Running}}' ${DOCKER_IMAGE} 2>/dev/null)","true")
	@echo '[Info] You are inside container "${DOCKER_IMAGE}"'
	@docker exec -it ${DOCKER_IMAGE} bash
else
	@echo '[Error] Container "${DOCKER_IMAGE}" is not running!'
endif

code-check: build-docker-image
	@echo '[Info] Checking coding style'
	@docker run --rm $(DOCKER_IMAGE) npm test

clean:
	@echo '[Info] Removing docker image "$(DOCKER_IMAGE)"...'
	@docker rmi $(DOCKER_IMAGE)

.PHONY: build-docker-image test enter code-check clean

.DEFAULT_GOAL = test
