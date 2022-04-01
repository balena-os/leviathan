FROM node:12.19.1-alpine3.12

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
COPY tsconfig.json tsconfig.json
COPY contracts contracts
COPY lib lib
COPY config config

ENV npm_config_unsafe_perm true

# hadolint ignore=DL3018
RUN apk add --no-cache --virtual .build-deps \
		python3 \
		make \
		build-base \
		linux-headers && \
	npm ci && \
	apk del .build-deps

RUN npm run build

# Install balena binary
RUN ln -sf /usr/app/node_modules/balena-cli/bin/balena /usr/bin/balena && \
    balena version

COPY entry.sh entry.sh

CMD [ "/usr/app/entry.sh" ]
