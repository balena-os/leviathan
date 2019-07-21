import * as dbus from 'dbus-next';
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

  constructor(private options: Leviathan.Options['network'], private bus = dbus.systemBus()) {
    // Cleanup code
    process.on('SIGINT', this.teardown);
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
        autoconnect: false
      },
      ipv4: { method },
      ipv6: { method: 'ignore' }
    };
  }

  private static wirelessTemplate(method: string, ssid: string, psk: string) {
    return {
      connection: {
        id: new dbus.Variant('s', NetworkManager.generateId()),
        type: new dbus.Variant('s', '802-11-wireless'),
        autoconnect: new dbus.Variant('b', false)
      },
      '802-11-wireless': {
        mode: new dbus.Variant('s', 'ap'),
        ssid: new dbus.Variant('ay', NetworkManager.stringToArrayOfBytes(ssid))
      },
      '802-11-wireless-security': {
        'key-mgmt': new dbus.Variant('s', 'wpa-psk'),
        psk: new dbus.Variant('s', psk)
      },
      ipv4: { method: new dbus.Variant('s', method) },
      ipv6: { method: new dbus.Variant('s', 'ignore') }
    };
  }

  private async addConnection(connection: any): Promise<string> {
    const con = (await this.bus.getProxyObject(
      'org.freedesktop.NetworkManager',
      '/org/freedesktop/NetworkManager/Settings'
    )).getInterface('org.freedesktop.NetworkManager.Settings');

    return con.AddConnectionUnsaved(connection);
  }

  private async removeConnection(reference: Connection): Promise<void> {
    const con = (await this.bus.getProxyObject(
      'org.freedesktop.NetworkManager',
      reference
    )).getInterface('org.freedesktop.NetworkManager.Settings.Connection');

    await con.Delete();
  }

  private async getDevice(iface: string): Promise<string> {
    const con = (await this.bus.getProxyObject(
      'org.freedesktop.NetworkManager',
      '/org/freedesktop/NetworkManager'
    )).getInterface('org.freedesktop.NetworkManager');

    return con.GetDeviceByIpIface(iface);
  }

  private async activateConnection(reference: Connection, device: string): Promise<string> {
    const con = (await this.bus.getProxyObject(
      'org.freedesktop.NetworkManager',
      '/org/freedesktop/NetworkManager'
    )).getInterface('org.freedesktop.NetworkManager');

    return con.ActivateConnection(reference, device, '/');
  }

  private async deactivateConnection(reference: ActiveConnection): Promise<void> {
    const con = (await this.bus.getProxyObject(
      'org.freedesktop.NetworkManager',
      '/org/freedesktop/NetworkManager'
    )).getInterface('org.freedesktop.NetworkManager');

    await con.DeactivateConnection(reference);
  }

  public async addWiredConnection(options: { nat?: boolean }): Promise<string> {
    if (this.options == null || this.options.wired == null) {
      throw new Error('Wired AP unconfigured');
    }

    if (options.nat == null) {
      throw new Error('Wired configuration incomplete');
    }

    if (this.wiredReference) {
      await this.removeWiredConnection();
    }

    const conn = await this.addConnection(
      NetworkManager.wiredTemplate(options.nat ? 'shared' : 'link-local')
    );
    const activeConn = await this.activateConnection(
      conn,
      await this.getDevice(this.options.wired)
    );

    console.log(`Wired AP; IFACE: ${this.options.wired}`);

    this.wiredReference = { conn, activeConn };

    return this.options.wired;
  }

  public async addWirelessConnection(options: {
    ssid?: string;
    psk?: string;
    nat?: boolean;
  }): Promise<string> {
    if (this.options == null || this.options.wireless == null) {
      throw new Error('Wireless AP unconfigured');
    }

    if (options.ssid == null || options.psk == null || options.nat == null) {
      throw new Error('Wireless configuration incomplete');
    }

    if (this.wirelessReference) {
      await this.removeWirelessConnection();
    }

    const conn = await this.addConnection(
      NetworkManager.wirelessTemplate(
        options.nat ? 'shared' : 'link-local',
        options.ssid,
        options.psk
      )
    );

    const activeConn = await this.activateConnection(
      conn,
      await this.getDevice(this.options.wireless)
    );

    console.log(`Wireless AP; SSID: ${options.ssid} IFACE: ${this.options.wireless}`);

    this.wirelessReference = { conn, activeConn };

    return this.options.wireless;
  }

  public async removeWiredConnection(): Promise<void> {
    if (this.wiredReference) {
      await this.deactivateConnection(this.wiredReference.activeConn);
      await this.removeConnection(this.wiredReference.conn);
      this.wiredReference = undefined;
    }
  }

  public async removeWirelessConnection(): Promise<void> {
    console.log(this.wirelessReference);
    if (this.wirelessReference) {
      await this.deactivateConnection(this.wirelessReference.activeConn);
      await this.removeConnection(this.wirelessReference.conn);
      console.log('done');
      this.wirelessReference = undefined;
    }
  }

  public async teardown(signal?: NodeJS.Signals) {
    await this.removeWiredConnection();
    await this.removeWirelessConnection();
    this.bus.disconnect();
    process.removeListener('SIGINT', this.teardown);

    if (signal === 'SIGINT') {
      process.exit(128 + os.constants.signals.SIGINT);
    }
  }
}

export interface Supported {
  configuration: Options;
}

export default NetworkManager;
