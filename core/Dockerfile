FROM debian:bullseye-slim@sha256:e5b6442dd2e9684cf5e87d8338b5968f3b348636fc0be6d7850a381e3731a2bd AS balena-cli

WORKDIR /tmp

ENV DEBCONF_NONINTERACTIVE_SEEN=true
ENV DEBIAN_FRONTEND=noninteractive

# bullseye LTS ended 2026-08-31 and packages are being deleted from the live
# mirrors while the index still advertises them, so apt 404s mid-build.
# archive.debian.org is no use here: it is frozen at point release 11.11, whose
# libc6-dev/libssl-dev pin exact runtime versions older than the ones this image
# already has installed, so they cannot be co-installed.
# The snapshot archive matching this image tag is consistent by construction,
# because the image was built from it. The base image ships both sets of lines
# in /etc/apt/sources.list, so flipping which are commented takes the timestamp
# from the image and stays correct when the base tag is bumped. The grep fails
# the build if a future base image stops shipping snapshot lines.
# Snapshot Release files are historical, so their Valid-Until has passed.
# See meta-balena#3938.
RUN sed -i -E \
	-e 's|^deb +http://deb\.debian\.org|# &|' \
	-e 's|^# *(deb +http://snapshot\.debian\.org)|\1|' \
	/etc/apt/sources.list \
	&& grep -q '^deb http://snapshot\.debian\.org' /etc/apt/sources.list \
	&& printf 'Acquire::Check-Valid-Until "false";\nAcquire::Retries "3";\n' > /etc/apt/apt.conf.d/99snapshot

# hadolint ignore=DL3008
RUN apt-get update && apt-get install --no-install-recommends -y \
  ca-certificates \
  curl \
  unzip && \
  rm -rf /var/lib/apt/lists/*

# renovate: datasource=github-releases depName=balena-io/balena-cli
ARG BALENA_CLI_VERSION=v25.2.6

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install balena-cli via standlone zip
RUN ARCH="$(dpkg --print-architecture | sed 's/amd/x/')" && \
  curl -fsSL "https://github.com/balena-io/balena-cli/releases/download/${BALENA_CLI_VERSION}/balena-cli-${BALENA_CLI_VERSION}-linux-${ARCH}-standalone.tar.gz" | tar -xzf - && \
  cp -a balena /usr/local/lib/balena && \
  ln -sf /usr/local/lib/balena/bin/balena /usr/local/bin/balena && \
  balena version

# The standalone balena-cli package is currently glibc only (no alpine/musl support)
FROM node:22.23.2-bullseye-slim@sha256:5736e7ef1f3f2109be7ef8aea0cbdf931804aee9a18c6760507b8ded078b25a9 AS base

# bullseye LTS ended 2026-08-31 and packages are being deleted from the live
# mirrors while the index still advertises them, so apt 404s mid-build.
# archive.debian.org is no use here: it is frozen at point release 11.11, whose
# libc6-dev/libssl-dev pin exact runtime versions older than the ones this image
# already has installed, so they cannot be co-installed.
# The snapshot archive matching this image tag is consistent by construction,
# because the image was built from it. The base image ships both sets of lines
# in /etc/apt/sources.list, so flipping which are commented takes the timestamp
# from the image and stays correct when the base tag is bumped. The grep fails
# the build if a future base image stops shipping snapshot lines.
# Snapshot Release files are historical, so their Valid-Until has passed.
# See meta-balena#3938.
RUN sed -i -E \
	-e 's|^deb +http://deb\.debian\.org|# &|' \
	-e 's|^# *(deb +http://snapshot\.debian\.org)|\1|' \
	/etc/apt/sources.list \
	&& grep -q '^deb http://snapshot\.debian\.org' /etc/apt/sources.list \
	&& printf 'Acquire::Check-Valid-Until "false";\nAcquire::Retries "3";\n' > /etc/apt/apt.conf.d/99snapshot

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

COPY --from=balena-cli /usr/local/lib/balena /usr/local/lib/balena
RUN ln -sf /usr/local/lib/balena/bin/balena /usr/local/bin/balena

# hadolint ignore=DL3059
RUN balena version

COPY package*.json ./

RUN npm ci

COPY . .

CMD [ "/usr/app/entry.sh" ]
