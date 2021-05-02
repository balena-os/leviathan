import { BalenaSDK, DeviceTag } from 'balena-sdk';

export class DeviceInfo {
	constructor(
		public readonly deviceId: number,
		public readonly tags: { [key: string]: string },
	) {}

	fileNamePrefix() {
		return ['DUT', 'model']
			.filter((tagName) => this.tags.hasOwnProperty(tagName))
			.map((tagName) => this.tags[tagName].replace(/\s*[,;]?\s+/, '_'))
			.join('-');
	}
}

export function groupTagsData(allAppTags: DeviceTag[]): DeviceInfo[] {
	const value: DeviceInfo[] = [];
	return allAppTags.reduce((res, tagData) => {
		const deviceId = (tagData.device as any).__id;
		let data = res.find((info) => info.deviceId === deviceId);
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
	constructor(private sdk: BalenaSDK) {}
	/**
	 * Authenticate balenaSDK with API key
	 */

	async authenticate(apiKey: string) {
		await this.sdk.auth.loginWithToken(apiKey);
	}

	/**
	 * @returns devices containing the DUT tag on balenaCloud application with value as the device type being tested
	 */

	async selectDevicesWithDUT(
		appName: string,
		dutType: string,
	): Promise<DeviceInfo[]> {
		const tags = await this.sdk.models.device.tags.getAllByApplication(appName);
		return groupTagsData(tags).filter((info) => info.tags['DUT'] === dutType);
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
