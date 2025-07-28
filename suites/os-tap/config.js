module.exports = 
  {
    deviceType: process.env.DEVICE_TYPE,
    config: {
      networkWired: false,
      networkWireless: false,
      balenaApiKey: process.env.BALENACLOUD_API_KEY,
      balenaApiUrl: process.env.BALENACLOUD_API_URL,
      organization: process.env.BALENACLOUD_ORG,
      sshConfig: {
        host: process.env.BALENACLOUD_SSH_URL,
        port: process.env.BALENACLOUD_SSH_PORT,
      }
    },
  }

