SHELL = /bin/bash
COMPOSE=$(shell \
	if command -v docker-compose &> /dev/null; \
	then \
		echo "docker-compose"; \
	else \
		curl -fsSL https://github.com/docker/compose/releases/download/1.29.2/run.sh -o ./docker-compose &> /dev/null && \
		chmod +x ./docker-compose && \
		echo "./docker-compose"; \
	fi)

Dockerfile:
	find . -maxdepth 2 -type f -name 'Dockerfile.template' -exec bash -c 'npm_config_yes=true npx dockerfile-template -d BALENA_ARCH="amd64" -f {} > `dirname {}`/Dockerfile' \;

.PHONY: local
local: Dockerfile
	@ln -sf ./compose/generic-x86.yml ./docker-compose.yml
ifndef DRY
	@${COMPOSE} up --build $(SERVICES)
endif

.PHONY: detached
detached: Dockerfile
	@ln -sf ./compose/generic-x86.yml ./docker-compose.yml
ifndef DRY
	@${COMPOSE} up --detach --build $(SERVICES)
endif

.PHONY: balena
balena:
	@ln -sf ./compose/balena.yml ./docker-compose.yml
ifndef DRY
ifdef PUSH
	@balena push $(PUSH)
else
	$(error To push to balena one needs to set PUSH=applicationName)
endif
endif

.PHONY: clean
clean:
	@${COMPOSE} down || true
	@find . -maxdepth 2 -type f -name 'Dockerfile' -exec rm {} +
	@rm docker-compose.yml

.DEFAULT_GOAL = balena
