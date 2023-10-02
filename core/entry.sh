#!/bin/bash

# Internet doesn't work in docker-in-docker when in network_mode: host 
# due to nftables and iptables-legacy conflict. Docker creates rules in
# iptables-legacy which is different from what the host (nftables) uses 
# leading to containers without internet. Commands need to run before starting Docker
# 
# Check out: https://stackoverflow.com/a/76488849/8522689

echo "Changing iptables to legacy iptables"
update-alternatives --set iptables /usr/sbin/iptables-legacy
update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy

rm -rf /var/run/docker 2>/dev/null || true
rm -f /var/run/docker.sock 2>/dev/null || true
rm -f /var/run/docker.pid 2>/dev/null || true

dockerd &

eval $(ssh-agent)
node lib/main.js
