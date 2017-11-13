DOCKER_IMAGE = resinos-tests

test: env.list build-docker-image
	@echo '[Info] Starting tests inside container...'
	docker run -it --rm --env-file $< $(DOCKER_IMAGE) npm start

build-docker-image: Dockerfile
	@echo '[Info] Building docker image "$(DOCKER_IMAGE)"...'
	docker build -t $(DOCKER_IMAGE) - < $<

clean:
	@echo '[Info] Removing docker image "$(DOCKER_IMAGE)"...'
	docker rmi $(DOCKER_IMAGE)

.PHONY: clean test build-docker-image

.DEFAULT_GOAL = test
