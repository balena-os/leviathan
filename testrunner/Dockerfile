# avoid alpine 3.13 or later due to this issue on armv7
# https://wiki.alpinelinux.org/wiki/Release_Notes_for_Alpine_3.13.0#time64_requirements

FROM balenalib/armv7hf-alpine:3.15-run 

WORKDIR /usr/src/app

# hadolint ignore=DL3018
RUN apk add --no-cache git ca-certificates docker nano make curl

# fail if binaries are missing or won't run
RUN dockerd --version && docker --version

# install entrypoint script
COPY entry.sh ./

RUN chmod +x entry.sh
CMD [ "/usr/src/app/entry.sh" ]