SHELL = /bin/bash
COMPOSE=$(shell \
		if command -v docker-compose &> /dev/null; \
		then echo "docker-compose"; \
		else echo "docker compose"; \
	fi)

Dockerfile:
	find . -maxdepth 2 -type f -name 'Dockerfile.template' -exec bash -c 'npm_config_yes=true npx dockerfile-template -d BALENA_ARCH="amd64" -f {} > `dirname {}`/Dockerfile' \;

local: Dockerfile
	@ln -sf ./compose/generic-x86.yml ./docker-compose.yml
ifndef DRY
	@${COMPOSE} build $(SERVICES)
	@${COMPOSE} up $(SERVICES)
endif

balena:
	@ln -sf ./compose/balena.yml ./docker-compose.yml
ifndef DRY
ifdef PUSH
	@balena push $(PUSH)
else
	$(error To push to balena one needs to set PUSH=applicationName)
endif
endif

clean:
	@${COMPOSE} down
	@find . -maxdepth 2 -type f -name 'Dockerfile' -exec rm {} +
	@rm docker-compose.yml


.PHONY: build-docker-image test enter code-check clean

.DEFAULT_GOAL = balena
