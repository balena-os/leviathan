#!/bin/bash

loop_major=7
loopctrl_minor=$(grep loop-control /proc/misc | cut -d ' ' -f1)
if [ -n "${loopctrl_minor}" ]; then
	if ! mknod -m 660 /dev/loop-control c "${misc_major}" "${loopctrl_minor}"; then
		echo "Unable to create loop-control device node"
		exit 1
	fi

	for i in $(seq 0 128); do
		mknod -m 660 "/dev/loop${i}" b "${loop_major}" "${i}"
	done
fi


rm -rf /var/run/docker 2>/dev/null || true
rm -f /var/run/docker.sock 2>/dev/null || true
rm -f /var/run/docker.pid 2>/dev/null || true

dockerd &

eval $(ssh-agent)
node lib/main.js
