FROM balenalib/amd64-alpine-node:12.19.1-3.12-run-20201211 AS node-build

WORKDIR /tmp/node

# hadolint ignore=DL3018
RUN apk add --no-cache libusb-dev dbus-dev python3 make build-base git linux-headers eudev-dev

ARG SKIP_INSTALL_BINARY

COPY package*.json ./
RUN npm ci

COPY tsconfig.json .
COPY typings typings
COPY lib lib
COPY bin bin

RUN npm run build

FROM balenalib/amd64-alpine:3.12-run-20211030

ENV UDEV 1

# ovmf is only packaged for x86_64 and aarch64 so ignore failures on arm
# hadolint ignore=DL3018
RUN apk add --no-cache \
  openrc openssh \
  nodejs~=12.22 \
  eudev-dev \
  libusb-dev dbus-dev \
  gstreamer-tools gst-plugins-base gst-plugins-bad gst-plugins-good \
  bridge bridge-utils iproute2 dnsmasq iptables \
  qemu-img qemu-system-x86_64 \
    && rm /usr/share/qemu/edk2* `# remove huge edk2 firmware` \
  && (apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/v3.12/community ovmf || true)

RUN apk add uhubctl --repository=http://dl-cdn.alpinelinux.org/alpine/edge/testing || true

# create qemu-bridge-helper ACL file
# https://wiki.qemu.org/Features/HelperNetworking
RUN mkdir -p /etc/qemu \
  && echo "allow all" > /etc/qemu/bridge.conf \
  && chmod 0640 /etc/qemu/bridge.conf

WORKDIR /usr/app

COPY config config
COPY id.pub /root/id.pub
COPY entry.sh .

COPY --from=node-build /tmp/node/package.json .
COPY --from=node-build /tmp/node/node_modules node_modules
COPY --from=node-build /tmp/node/build build

CMD ./entry.sh
