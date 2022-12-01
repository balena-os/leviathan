#!/usr/bin/env bash

rm -rf /var/run/docker 2>/dev/null || true
rm -f /var/run/docker.sock 2>/dev/null || true
rm -f /var/run/docker.pid 2>/dev/null || true

dockerd --bip 172.64.0.1/16 &

eval $(ssh-agent)
node lib/main.js
