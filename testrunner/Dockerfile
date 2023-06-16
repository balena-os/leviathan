# avoid alpine 3.13 or later due to this issue on armv7
# https://wiki.alpinelinux.org/wiki/Release_Notes_for_Alpine_3.13.0#time64_requirements
FROM alpine:3.12

WORKDIR /usr/src/app

# https://github.com/balena-io/balena-cli/blob/master/INSTALL-LINUX.md#additional-dependencies
# hadolint ignore=DL3018
RUN apk add --no-cache bash git ca-certificates docker nano make curl

# fail if binaries are missing or won't run
RUN dockerd --version && docker --version

# install entrypoint script
COPY entry.sh ./

RUN chmod +x entry.sh
CMD [ "/usr/src/app/entry.sh" ]