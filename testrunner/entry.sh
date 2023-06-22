#!/bin/bash

# Clone Leviathan
https://github.com/balena-os/Leviathan

rm -rf /var/run/docker 2>/dev/null || true
rm -f /var/run/docker.sock 2>/dev/null || true
rm -f /var/run/docker.pid 2>/dev/null || true

dockerd &

tail -f /dev/null