#!/usr/bin/env node

const yargs = require("yargs");
const RsyncUploader = require("../lib/rsync-uploader");

const options = yargs
  .scriptName("leviathan-cli")
  .usage("Usage: -n <name>")
  .option("i", { alias: "image", describe: "Image local path", type: "string", demandOption: true })
  .option("d", { alias: "device", describe: "Device Type", type: "string", demandOption: false })
  .option("s", { alias: "suite", describe: "Test Suite", type: "string", demandOption: false })
  .option("c", { alias: "config", describe: "Config local path", type: "string", demandOption: false })
  .argv;

RsyncUploader.uploadImage(options.image);
