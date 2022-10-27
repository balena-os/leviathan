const configYaml = require("config-yaml");

const config = configYaml(`${__dirname}/../config/default.yaml`);

module.exports = config;
