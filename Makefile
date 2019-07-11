SHELL = /bin/bash

Dockerfile:
	@find . -maxdepth 2 -type f -name 'Dockerfile.template' -exec bash -c 'npx dockerfile-template -d BALENA_MACHINE_NAME="intel-nuc" -f {} > `dirname {}`/Dockerfile' \;

local: Dockerfile
	@ln -sf ./compose/generic-x86.yml ./docker-compose.yml
	@docker-compose build
	@docker-compose up

balena:
	@ln -sf ./compose/balena.yml ./docker-compose.yml
	@balena push $(PUSH)

clean:
	@docker-compose down
	@find . -maxdepth 2 -type f -name 'Dockerfile' -exec rm {} +
	@rm docker-compose.yml


.PHONY: build-docker-image test enter code-check clean

.DEFAULT_GOAL = balena
