const { getSdk } = require('balena-sdk');

/**
 * Contains information about the workers with tags that they have
 */
class DeviceInfo {
	constructor(deviceId, tags) {
		this.deviceId = deviceId
		this.tags = tags
	}

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
function groupTagsData(allAppTags) {
	const value = [];
	return allAppTags.reduce((res, tagData) => {
		const deviceId = (tagData.device).__id;
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
class BalenaCloudInteractor {
	constructor(balenaApiUrl) {
		this.balenaApiUrl = balenaApiUrl
		this.sdk = getSdk({
			apiUrl: `https://api.${balenaApiUrl}`,
		});
	}

	/**
	 * Authenticate balenaSDK with API key
	 */
	async authenticate(balenaApiKey) {
		await this.sdk.auth.loginWithToken(balenaApiKey);
		console.log(`Logged in with ${await this.sdk.auth.whoami()}'s account on ${this.balenaApiUrl} using balenaSDK`);
	}

	/**
	 * @returns list of online devices containing the DUT tag with device type being tested as the value
	 */
	async selectDevicesWithDUT(appName, dutType) {
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
	async checkDeviceUrl(device) {
		const enabled = await this.sdk.models.device.hasDeviceUrl(device.deviceId);
		if (!enabled) {
			throw new Error('Worker not publicly available. Panicking...');
		}
	}

	/**
	 * @returns device's public URL
	 */
	async resolveDeviceUrl(device) {
		const deviceUrl = await this.sdk.models.device.getDeviceUrl(device.deviceId)
		if (Object.keys(deviceUrl).length === 0 && deviceUrl.constructor === Object) {
			throw new Error(`Public Device URL not found for device ${device.deviceId}`)
		}
		return deviceUrl
	}
}

module.exports = { BalenaCloudInteractor }