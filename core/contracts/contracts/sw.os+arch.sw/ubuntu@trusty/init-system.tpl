# Install Systemd

RUN apt-get update && apt-get install -y --no-install-recommends \
        systemd \
    && rm -rf /var/lib/apt/lists/*

ENV container docker

# We never want these to run in a container
RUN systemctl mask \
    dev-hugepages.mount \
    sys-fs-fuse-connections.mount \
    sys-kernel-config.mount \

    display-manager.service \
    getty@.service \
    systemd-logind.service \
    systemd-remount-fs.service \

    getty.target \
    graphical.target

COPY entry.sh /usr/bin/entry.sh

# launch.service
RUN echo '[Unit]\n\
Description=Resin.io User Application\n\
\n\
[Service]\n\
EnvironmentFile=/etc/docker.env\n\
ExecStart=/etc/resinApp.sh\n\
StandardOutput=tty\n\
StandardError=tty\n\
TTYPath=/dev/console\n\
Restart=on-failure\n\
\n\
[Install]\n\
WantedBy=basic.target' > /etc/systemd/system/launch.service

RUN systemctl enable /etc/systemd/system/launch.service

STOPSIGNAL 37
VOLUME ["/sys/fs/cgroup"]
ENTRYPOINT ["/usr/bin/entry.sh"]
