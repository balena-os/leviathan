DOCKER_IMAGE = resinos-tests

build-docker-image: Dockerfile
	@echo '[Info] Building docker image "$(DOCKER_IMAGE)"...'
	@docker build -t $(DOCKER_IMAGE) .

test: build-docker-image
	@echo '[Info] Starting tests inside container...'
	@docker run -it --rm \
		--env "RESINOS_TESTS_APPLICATION_NAME=$(RESINOS_TESTS_APPLICATION_NAME)" \
		--env "RESINOS_TESTS_DEVICE_TYPE=$(RESINOS_TESTS_DEVICE_TYPE)" \
		--env "RESINOS_TESTS_EMAIL=$(RESINOS_TESTS_EMAIL)" \
		--env "RESINOS_TESTS_PASSWORD=$(RESINOS_TESTS_PASSWORD)" \
		--env "RESINOS_TESTS_WIFI_SSID=$(RESINOS_TESTS_WIFI_SSID)" \
		--env "RESINOS_TESTS_WIFI_KEY=$(RESINOS_TESTS_WIFI_KEY)" \
		--env "RESINOS_TESTS_DISK=$(RESINOS_TESTS_DISK)" \
		$(DOCKER_IMAGE) npm start

clean:
	@echo '[Info] Removing docker image "$(DOCKER_IMAGE)"...'
	@docker rmi $(DOCKER_IMAGE)

.PHONY: build-docker-image test clean

.DEFAULT_GOAL = test
