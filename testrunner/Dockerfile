FROM node:14.19.3-bullseye-slim as base
ENV DBUS_SYSTEM_BUS_ADDRESS unix:path=/host/run/dbus/system_bus_socket

WORKDIR /usr/app

ENV DEBCONF_NONINTERACTIVE_SEEN true
ENV DEBIAN_FRONTEND noninteractive

# install docker, balena-cli dependencies, and suite dependencies
# https://github.com/balena-io/balena-cli/blob/master/INSTALL-LINUX.md#additional-dependencies
# hadolint ignore=DL3008
RUN apt-get update && apt-get install --no-install-recommends -y \
	ca-certificates \
    docker.io \
	git \
	rsync \
	unzip \
	util-linux \
	wget \
	nano \
	build-essential \
	make  \
    curl

COPY . .
RUN chmod +x entry.sh

CMD [ "/usr/app/entry.sh" ]