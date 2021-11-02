module.exports = {
	worker: {
		port: 2000,
		runtimeConfiguration: {
			workdir: process.env.WORKDIR || '/data',
			workerType: process.env.WORKER_TYPE || 'testbot_hat',
			screenCapture: process.env.SCREEN_CAPTURE === 'true',
			network: {
				wired: process.env.NETWORK_WIRED_INTERFACE || 'eth1',
				wireless: process.env.NETWORK_WIRELESS_INTERFACE || 'wlan0',
			},
			qemu: {
				network: {
					bridgeName: process.env.QEMU_BRIDGE_NAME || 'br0',
					bridgeAddress: process.env.QEMU_BRIDGE_ADDRESS || '192.168.100.1',
					dhcpRange: process.env.QEMU_DHCP_RANGE || '192.168.100.2,192.168.100.254',
				},
				architecture: process.env.QEMU_ARCH || 'x86_64',
				cpus: process.env.QEMU_CPUS || '4',
				memory: process.env.QEMU_MEMORY || '2G',
				debug: process.env.QEMU_DEBUG || false,
			}
		},
	},
};
