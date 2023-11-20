const { getSdk } = require('balena-sdk');
const fs = require('fs');

let report = { verdict: false, errors: [] };
let counter = 1;

async function testConfig(configs) {
  for (const config of configs) {
    console.log(`Validation config ${counter} from config.js file ...`)

    // Setup SDK as per the API URL
    const balena = getSdk({
      apiUrl: `https://api.${config.config.balenaApiUrl}`,
    });

    // deviceType exists?
    try {
      let deviceType = await balena.models.deviceType.getName(config.deviceType)
      console.log(`Device is valid. Targeting tests on ${deviceType} DUT ✅`)
    } catch (e) {
      console.log(`${e.message} ❌`)
      report.errors.push({ deviceType: `${e.message}. Check the spelling or verify if the exists on ${config.config.balenaApiUrl}` })
      report.verdict = false
    }

    // suitePath exists?
    try {
      fs.accessSync(config.suite, fs.F_OK);
      console.log(`Using test suite from path: ${config.suite} ✅`)
    } catch (e) {
      console.log(`Tests not found: ${e.message} ❌`)
      report.errors.push({ suite: `Tests not found, check path. ${e.message}` })
      report.verdict = false
    }

    // OS image path exist?
    try {
      if (config.image === false) {
        console.log(`False flag provided, tests would be downloading ${config.deviceType} ${config.config.downloadVersion} image later ✅\n`)
      } else {
        fs.accessSync(config.image, fs.F_OK);
        console.log(`Testing using OS image: #${config.image} ✅\n`)
      }
    } catch (e) {
      console.log(`OS image not found: ${e.message} ❌\n`)
      report.errors.push({ image: `OS image not found. Check path. ${e.message}` })
      report.verdict = false
    }

    // Add new config validation tests here

    if (report.errors.length === 0) {
      report.verdict = true
    } else {
      report.config = config
      return report
    }
    counter++
  }
  return report
}

module.exports = { testConfig }