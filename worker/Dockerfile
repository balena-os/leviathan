
ARG BALENA_ARCH=amd64

# renovate: datasource=github-releases depName=balena-os/leviathan-worker extractVersion=v(?<version>.*)$
ARG WORKER_VERSION=2.9.50

# hadolint ignore=DL3006
FROM bh.cr/balena/leviathan-worker-${BALENA_ARCH}/${WORKER_VERSION}
