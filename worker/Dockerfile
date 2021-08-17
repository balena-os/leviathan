FROM balenalib/intel-nuc-golang:1.15-buster-build AS go-build

RUN GO111MODULE=on go get -u github.com/nadoo/glider@v0.12.2

FROM balenalib/intel-nuc-node:12-buster-build AS node-build

WORKDIR /tmp/node

RUN install_packages libdbus-1-dev libvirt-dev python

COPY package*.json ./
RUN npm ci

COPY tsconfig.json .
COPY typings typings
COPY lib lib
COPY bin bin

RUN npm run build

FROM balenalib/intel-nuc-node:12-buster-run

ENV UDEV=1


RUN install_packages \
  libusb-dev libdbus-1-dev \
  gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-bad gstreamer1.0-plugins-good \
  qemu-system-x86 libvirt-daemon-system bridge-utils iproute2 dnsmasq iptables ebtables

# Disable all cgroup controls as we do not use them

COPY --from=go-build /go/bin/glider /usr/local/bin

WORKDIR /usr/app

COPY config config
COPY entry.sh .

COPY --from=node-build /tmp/node/package.json .
COPY --from=node-build /tmp/node/node_modules node_modules
COPY --from=node-build /tmp/node/build build

EXPOSE 2000

ENV WORKER_TYPE=qemu

CMD [ "./entry.sh" ]
