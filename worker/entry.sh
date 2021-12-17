#!/bin/sh

tun_minor=$(grep tun /proc/misc | cut -d ' ' -f1)
if [ -n "${tun_minor}" ]; then
	mkdir -p /dev/net
	if ! mknod -m 666 /dev/net/tun c 10 "${tun_minor}"; then
		echo "Unable to create TUN device node"
		exit 1
	fi
else
	echo "TUN is unavailable, unable to setup networking"
	exit 1
fi


kvm_minor=$(grep kvm /proc/misc | cut -d ' ' -f1)
if [ -n "${kvm_minor}" ]; then
	if ! mknod -m 666 /dev/kvm c 10 "${kvm_minor}"; then
		echo "Unable to create KVM device node, software emulation is still available"
	fi
else
	echo "KVM is unavailable, falling back on software emulation"
fi

node ./build/bin
