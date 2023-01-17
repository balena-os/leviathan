module.exports = {
	core: {
		host: process.env.CORE_HOST || 'core',
		port: process.env.CORE_PORT || 2000
	},
	balena: {
		apiUrl: 'https://api.balena-cloud.com' || process.env.BALENACLOUD_API_URL
	}
};
