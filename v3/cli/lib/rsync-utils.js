const Rsync = require("rsync");
const config = require("./config");

class RsyncUtils {
  sshCopy(deviceUuid, localPath, remotePath) {
    const rsync = new Rsync()
      .shell(`ssh ${config.ssh.username}@${config.ssh.host} -q -p ${config.ssh.port} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null host ${deviceUuid}`)
      .flags("avz")
      .source(localPath)
      .destination(`:${remotePath}`);

    return new Promise((resolve, reject) => {
      try {
        let logData = "";

        rsync.execute(
          (error, code, cmd) => {
            resolve({error, code, cmd, data: logData});
            console.log(logData);
          },
          (data) => {
            logData += data;
          },
          (err) => {
            logData += err;
          }
        );


      } catch (error) {
        reject(error);
      }
    });
  }

  createRemoteTree(remotePath) {

  }
}

module.exports = new RsyncUtils();
