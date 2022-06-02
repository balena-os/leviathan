FROM node:14.19.3-alpine3.15

WORKDIR /usr/app

# hadolint ignore=DL3018
RUN apk add --no-cache \
		bash \
		jq \
		git \
		vim \
		rsync \
		unzip \
		openssh-client \
		socat \
		rsync \
		docker \
		bind-tools \
		util-linux

COPY package*.json ./

ENV npm_config_unsafe_perm true

# hadolint ignore=DL3018
RUN apk add --no-cache --virtual .build-deps \
		python3 \
		make \
		build-base \
		linux-headers && \
	npm ci && \
	apk del .build-deps

# Install balena binary
RUN ln -sf /usr/app/node_modules/balena-cli/bin/balena /usr/bin/balena && \
    balena version

COPY contracts contracts
COPY lib lib
COPY config config
COPY entry.sh entry.sh

CMD [ "/usr/app/entry.sh" ]
