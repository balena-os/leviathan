FROM node:14.19.3-bullseye-slim as base

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
	git \
	iproute2 \
	jq \
	openssh-client \
	socat \
	rsync \
	unzip \
	util-linux \
	wget \
	vim && \
	apt-get clean && \
	rm -rf /var/lib/apt/lists/*

ARG BALENA_CLI_VERSION=v14.3.0

# Install balena-cli via standlone zip, only compatible with glibc (not alpine/musl)
RUN wget -q -O balena-cli.zip "https://github.com/balena-io/balena-cli/releases/download/${BALENA_CLI_VERSION}/balena-cli-${BALENA_CLI_VERSION}-linux-x64-standalone.zip" && \
	unzip balena-cli.zip && rm balena-cli.zip

# Add balena-cli to PATH
ENV PATH /usr/app/balena-cli:$PATH

FROM base as npm-ci

COPY package*.json ./

# install npm ci dependencies in a temporary build stage
# hadolint ignore=DL3008
RUN apt-get update && apt-get install --no-install-recommends -y \
	build-essential \
	make \
	python && \
	apt-get clean && \
	rm -rf /var/lib/apt/lists/*

RUN npm ci

FROM base as final

RUN apt-get update && apt-get install --no-install-recommends -y \
	build-essential \
	make \
	python && \
	apt-get clean && \
	rm -rf /var/lib/apt/lists/*

COPY . .

COPY --from=npm-ci /usr/app/node_modules node_modules

CMD [ "/usr/app/entry.sh" ]
