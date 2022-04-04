#!/bin/bash

rm -rf /var/run/docker 2>/dev/null || true
rm -f /var/run/docker.sock 2>/dev/null || true
rm -f /var/run/docker.pid 2>/dev/null || true

dockerd &

eval $(ssh-agent)

cd /usr/app/build && node lib/main.js
