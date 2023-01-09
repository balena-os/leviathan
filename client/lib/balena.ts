const { BalenaSDK, DeviceTag } = require('balena-sdk')

/**
 * Contains information about the workers with tags that they have
 */
export class DeviceInfo {
	constructor(
		public readonly deviceId: number,
		public readonly tags: { [key: string]: string },
	) {}

	/**
	 * @returns unique worker prefix by joining values of DUT and model tag. Example: `raspberrypi3-64-RPi3_A`
	 */
	fileNamePrefix() {
		return ['DUT', 'model']
			.filter((tagName) => this.tags.hasOwnProperty(tagName))
			.map((tagName) => this.tags[tagName].replace(/\s*[,;]?\s+/, '_'))
			.join('-');
	}
}

/**
 * Groups unique devices containing tags with their value into a array containing DeviceInfo objects
 */
export function groupTagsData(allAppTags: typeof DeviceTag[]): DeviceInfo[] {
	const value: DeviceInfo[] = [];
	return allAppTags.reduce((res, tagData) => {
		const deviceId = (tagData.device as any).__id;
		let data = res.find((info: any) => info.deviceId === deviceId);
		if (data == null) {
			data = new DeviceInfo(deviceId, {});
			value.push(data);
		}
		data.tags[tagData.tag_key] = tagData.value;
		return value;
	}, value);
}

/**
 * Interacts with balenaCloud for the client
 */
export class BalenaCloudInteractor {
	constructor(private sdk: typeof BalenaSDK) {}
	/**
	 * Authenticate balenaSDK with API key
	 */
	async authenticate(apiKey: string) {
		await this.sdk.auth.loginWithToken(apiKey);
	}

	/**
	 * @returns list of online devices containing the DUT tag with device type being tested as the value
	 */
	async selectDevicesWithDUT(
		appName: string,
		dutType: string,
	): Promise<DeviceInfo[]> {
		const selectedDevices = [];
		const tags = await this.sdk.models.device.tags.getAllByApplication(appName);
		const taggedDevices = groupTagsData(tags).filter(
			(device) => device.tags['DUT'] === dutType,
		);
		for (const taggedDevice of taggedDevices) {
			const online = await this.sdk.models.device.isOnline(
				taggedDevice.deviceId,
			);
			if (online) {
				selectedDevices.push(taggedDevice);
			}
		}
		return selectedDevices;
	}

	/**
	 * @throws error when public url for the device type is not accessible
	 */
	async checkDeviceUrl(device: DeviceInfo) {
		const enabled = await this.sdk.models.device.hasDeviceUrl(device.deviceId);
		if (!enabled) {
			throw new Error('Worker not publicly available. Panicking...');
		}
	}

	/**
	 * @returns device's public URL
	 */
	async resolveDeviceUrl(device: DeviceInfo): Promise<string> {
		return this.sdk.models.device.getDeviceUrl(device.deviceId);
	}
}
