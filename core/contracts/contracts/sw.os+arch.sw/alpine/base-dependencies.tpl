RUN apk add --update \
  bash \
  ca-certificates \
  curl \
  dbus \
  findutils \
  openrc \
  tar \
  udev \
  tini \
  && rm -rf /var/cache/apk/*
