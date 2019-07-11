import * as dbus from 'dbus-as-promised';
import * as os from 'os';

type ActiveConnection = string;
type Connection = ActiveConnection;

interface Options {
	wireless?: {
		psk: string;
		ssid: string;
		nat: boolean;
	};
	wired?: { nat: boolean };
}

class NetworkManager {
	private wiredReference?: {
		activeConn: ActiveConnection;
		conn: Connection;
	};
	private wirelessReference?: {
		activeConn: ActiveConnection;
		conn: Connection;
	};

	constructor(
		private options: Leviathan.Options['network'],
		private bus = dbus.getBus('system'),
	) {
		// Cleanup code
		process.on('SIGINT', this.disconnect);
	}

	private static stringToArrayOfBytes(str: string): Array<number> {
		let bytes = [];
		for (var i = 0; i < str.length; ++i) {
			bytes.push(str.charCodeAt(i));
		}
		return bytes;
	}

	private static generateId(): string {
		return Math.random()
			.toString(36)
			.substring(2, 10);
	}

	private static wiredTemplate(method: string) {
		return {
			connection: {
				id: NetworkManager.generateId(),
				type: '802-3-ethernet',
				autoconnect: false,
			},
			ipv4: { method },
			ipv6: { method: 'ignore' },
		};
	}

	private static wirelessTemplate(method: string, ssid: string, psk: string) {
		return {
			connection: {
				id: NetworkManager.generateId(),
				type: '802-11-wireless',
				autoconnect: false,
			},
			'802-11-wireless': {
				mode: 'ap',
				ssid: NetworkManager.stringToArrayOfBytes(ssid),
			},
			'802-11-wireless-security': {
				'key-mgmt': 'wpa-psk',
				psk,
			},
			ipv4: { method },
			ipv6: { method: 'ignore' },
		};
	}

	private async addConnection(connection: any): Promise<string> {
		const con = await this.bus.getInterface(
			'org.freedesktop.NetworkManager',
			'/org/freedesktop/NetworkManager/Settings',
			'org.freedesktop.NetworkManager.Settings',
		);

		return con.AddConnectionUnsaved(connection);
	}

	private async removeConnection(reference: Connection): Promise<void> {
		const con = await this.bus.getInterface(
			'org.freedesktop.NetworkManager',
			reference,
			'org.freedesktop.NetworkManager.Settings.Connection',
		);

		await con.Delete();
	}

	private async getDevice(iface: string): Promise<string> {
		const con = await this.bus.getInterface(
			'org.freedesktop.NetworkManager',
			'/org/freedesktop/NetworkManager',
			'org.freedesktop.NetworkManager',
		);

		return con.GetDeviceByIpIface(iface);
	}

	private async activateConnection(
		reference: Connection,
		device: string,
	): Promise<string> {
		const con = await this.bus.getInterface(
			'org.freedesktop.NetworkManager',
			'/org/freedesktop/NetworkManager',
			'org.freedesktop.NetworkManager',
		);

		return con.ActivateConnection(reference, device, '/');
	}

	private async deactivateConnection(
		reference: ActiveConnection,
	): Promise<void> {
		const con = await this.bus.getInterface(
			'org.freedesktop.NetworkManager',
			'/org/freedesktop/NetworkManager',
			'org.freedesktop.NetworkManager',
		);

		await con.DeactivateConnection(reference);
	}

	public async addWiredConnection(options: { nat?: boolean }): Promise<string> {
		if (this.options == null || this.options.apWiredIface == null) {
			throw new Error('Wired AP unconfigured');
		}

		if (options.nat == null) {
			throw new Error('Wired configuration incomplete');
		}

		if (this.wiredReference) {
			await this.removeWiredConnection();
		}

		const conn = await this.addConnection(
			NetworkManager.wiredTemplate(options.nat ? 'shared' : 'link-local'),
		);
		const activeConn = await this.activateConnection(
			conn,
			await this.getDevice(this.options.apWiredIface),
		);

		console.log(`Wired AP; IFACE: ${this.options.apWiredIface}`);

		this.wiredReference = { conn, activeConn };

		return this.options.apWiredIface;
	}

	public async addWirelessConnection(options: {
		ssid?: string;
		psk?: string;
		nat?: boolean;
	}): Promise<string> {
		if (this.options == null || this.options.apWifiIface == null) {
			throw new Error('Wireless AP unconfigured');
		}

		if (options.ssid == null || options.psk == null || options.nat == null) {
			throw new Error('Wireles configuration incomplete');
		}

		if (this.wirelessReference) {
			await this.removeWirelessConnection();
		}

		const conn = await this.addConnection(
			NetworkManager.wirelessTemplate(
				options.nat ? 'shared' : 'link-local',
				options.ssid,
				options.psk,
			),
		);
		const activeConn = await this.activateConnection(
			conn,
			await this.getDevice(this.options.apWifiIface),
		);

		console.log(
			`Wireless AP; SSID: ${options.ssid} IFACE: ${this.options.apWifiIface}`,
		);

		this.wirelessReference = { conn, activeConn };

		return this.options.apWifiIface;
	}

	public async removeWiredConnection(): Promise<void> {
		if (this.wiredReference) {
			await this.deactivateConnection(this.wiredReference.activeConn);
			await this.removeConnection(this.wiredReference.conn);
			this.wiredReference = undefined;
		}
	}

	public async removeWirelessConnection(): Promise<void> {
		if (this.wirelessReference) {
			await this.deactivateConnection(this.wirelessReference.activeConn);
			await this.removeConnection(this.wirelessReference.conn);
			this.wirelessReference = undefined;
		}
	}

	public async disconnect(signal?: NodeJS.Signals) {
		await this.removeWiredConnection();
		await this.removeWirelessConnection();
		this.bus.disconnect();

		process.removeListener('SIGINT', this.disconnect);

		if (signal === 'SIGINT') {
			process.exit(128 + os.constants.signals.SIGINT);
		}
	}
}

export interface Supported {
	configuration: Options;
}

export default NetworkManager;
