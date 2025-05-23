FROM debian:bullseye-slim AS balena-cli

WORKDIR /tmp

ENV DEBCONF_NONINTERACTIVE_SEEN=true
ENV DEBIAN_FRONTEND=noninteractive

# hadolint ignore=DL3008
RUN apt-get update && apt-get install --no-install-recommends -y \
  ca-certificates \
  curl \
  unzip && \
  rm -rf /var/lib/apt/lists/*

# renovate: datasource=github-releases depName=balena-io/balena-cli
ARG BALENA_CLI_VERSION=v21.1.14

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install balena-cli via standlone zip
RUN ARCH="$(dpkg --print-architecture | sed 's/amd/x/')" && \
  curl -fsSL -o balena-cli.zip "https://github.com/balena-io/balena-cli/releases/download/${BALENA_CLI_VERSION}/balena-cli-${BALENA_CLI_VERSION}-linux-${ARCH}-standalone.zip" && \
  unzip balena-cli.zip && \
  cp -a balena-cli /usr/local/lib/balena-cli && \
  ln -sf /usr/local/lib/balena-cli/balena /usr/local/bin/balena && \
  balena version

# The standalone balena-cli package is currently glibc only (no alpine/musl support)
FROM node:22.14.0-bullseye-slim AS base

WORKDIR /usr/app

ENV DEBCONF_NONINTERACTIVE_SEEN=true
ENV DEBIAN_FRONTEND=noninteractive

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
  vim \
  build-essential \
  make \
  python && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

COPY --from=balena-cli /usr/local/lib/balena-cli /usr/local/lib/balena-cli
COPY --from=balena-cli /usr/local/bin/balena /usr/local/bin/balena

RUN balena version

COPY package*.json ./

RUN npm ci

COPY . .

CMD [ "/usr/app/entry.sh" ]
