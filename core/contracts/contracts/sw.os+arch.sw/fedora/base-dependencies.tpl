RUN dnf update -y && dnf install -y \
  ca-certificates \
  findutils \
  hostname \
  systemd \
  tar \
  udev \
  which \
  curl \
  && dnf clean all
