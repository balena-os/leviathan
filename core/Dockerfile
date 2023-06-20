FROM node:16-bullseye-slim as base

WORKDIR /usr/app

ENV DEBCONF_NONINTERACTIVE_SEEN true
ENV DEBIAN_FRONTEND noninteractive

# install docker, balena-cli dependencies, and suite dependencies
# https://github.com/balena-io/balena-cli/blob/master/INSTALL-LINUX.md#additional-dependencies
# hadolint ignore=DL3008

RUN apt-get update && apt-get install --no-install-recommends -y \
	bind9-dnsutils \
	ca-certificates \
	docker.io \
	iproute2 \
	wget \
	openssh-client \
	libudev-dev \	
	unzip \
	util-linux \
	build-essential \
	make \
	python3 && \
	apt-get clean && \
	rm -rf /var/lib/apt/lists/*

ARG BALENA_CLI_REF="v16.1.0"
ARG BALENA_CLI_VERSION="16.1.0"

# Install balena-cli via standlone zip, only compatible with glibc (not alpine/musl)
RUN if [ "$(uname -m)" = "arm64" ] || [ "$(uname -m)" = "aarch64" ] ; \
	then \
		wget -q -O balena-cli.zip "https://github.com/balena-io/balena-cli/releases/download/${BALENA_CLI_REF}/balena-cli-v${BALENA_CLI_VERSION}-linux-arm64-standalone.zip" && \
		unzip balena-cli.zip && rm balena-cli.zip ; \
	elif [ "$(uname -m)" = "armv7l" ] || [ "$(uname -m)" = "armv7hf" ] ; \
	then \
		npm i balena-cli@latest ; \
		mkdir /usr/app/cli/ ; \
		mv /usr/app/node_modules/balena-cli/ /usr/app ; \
		rm -rf /usr/app/node_modules/ ; \
	else \
		wget -q -O balena-cli.zip "https://github.com/balena-io/balena-cli/releases/download/${BALENA_CLI_REF}/balena-cli-v${BALENA_CLI_VERSION}-linux-x64-standalone.zip" && \
		unzip balena-cli.zip && rm balena-cli.zip ; \
	fi

# Add balena-cli to PATH
ENV PATH /usr/app/balena-cli:$PATH
RUN ls /usr/app/balena-cli && ls /usr/app/balena-cli/bin
ENV PATH $PATH:/usr/app/balena-cli/bin

RUN balena version

COPY package*.json ./

RUN npm ci --only=production

COPY . .

CMD [ "/usr/app/entry.sh" ]
