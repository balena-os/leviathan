DOCKER_IMAGE = resinos-tests
ARGS_DEFINITION = env.list.example

test: env.list build-docker-image
	@echo '[Info] Starting tests inside container...'
	docker run -it --rm --env-file $< \
		$(call pass_args, $(call get_args, $(ARGS_DEFINITION))) \
		$(DOCKER_IMAGE)

build-docker-image: Dockerfile
	@echo '[Info] Building docker image "$(DOCKER_IMAGE)"...'
	docker build -t $(DOCKER_IMAGE) .

clean:
	@echo '[Info] Removing docker image "$(DOCKER_IMAGE)"...'
	docker rmi $(DOCKER_IMAGE)

pass_args = \
  $(foreach v,$(1), \
    $(if $(value $v), -e $(v)=$($(v)), $(value $v)))
get_args = \
  $(shell cut -d '=' -f 1 $(1))

.PHONY: clean test build-docker-image

.DEFAULT_GOAL = test
