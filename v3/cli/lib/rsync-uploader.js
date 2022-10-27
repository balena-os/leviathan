const RsyncUtils = require("../lib/rsync-utils");
const Uploader = require("./uploader");
const config = require("./config");

class RsyncUploader extends Uploader {
  uploadImage(localImagePath) {
    console.log("RsyncUploader upload");

    RsyncUtils.sshCopy(config.worker.device.uuid, localImagePath, config.ssh.remotePath);
  }
}

module.exports = new RsyncUploader();
