const _ = require('lodash');
const imageWriter = require('etcher-image-write');
const mountutils = Promise.promisifyAll(require('mountutils'));
const progress = require('progress-stream');
const bar = require('cli-progress');
const drivelist = require('drivelist');
const form = require('resin-cli-form');
const lkl = require('lkl');
const filedisk = require('file-disk');
lkl.fs = Promise.promisifyAll(lkl.fs);


function nmWifiConfig(options) {
    var ssid = options.wifiSsid.trim();
    if (_.isEmpty(ssid))
        return null

    var config = `
        [connection]
        id=resin-wifi
        type=wifi
        [wifi]
        hidden=true
        mode=infrastructure
        ssid=#{options.wifiSsid}
        [ipv4]
        method=auto
        [ipv6]
        addr-gen-mode=stable-privacy
        method=auto
    `

	if (options.wifiKey) {
        config += `
            [wifi-security]
            auth-alg=open
            key-mgmt=wpa-psk
            psk=#{options.wifiKey}
        `
	}

	return config
}

function writeConfigure(config) {
	var wifiConfig = nmWifiConfig(config)
	var config = _.omit(config, 'wifiSsid', 'wifiKey');

	Promise.using(filedisk.openFile(path.join(assetDir, 'resin.img'), 'r+'), (fd) => {
		var disk = new filedisk.FileDisk(fd);
		Promise.using(lkl.utils.attachDisk(disk), (diskId) => {
			Promise.using(lkl.utils.mountPartition(diskId, 'vfat'), (mountpoint) => {
                lkl.fs.writeFileAsync(path.join(mountpoint, 'config.json'), JSON.stringfy(config)).then(() => {
					if (wifiConfig) {
                            lkl.fs.writeFileAsync(path.join(mountpoint, '/system-connections/resin-wifi'), wifiConfig);
					}
                });
			});
		});
	});
}

function validateDisk(disk) {
    return drivelist.listAsync()
        .then((disks) => {
            var d = _.find(disks, { device: disk });

            if (typeof d == 'undefined') {
                throw new Error(`The selected drive ${disk} was not found`);
            } else {
                return d.device;
            }
        });
}

function getImage(deviceType, version) {
    var _download = new bar.Bar({}, bar.Presets.shades_classic);
    var os = resin.models.os

    return new Promise((resolve, reject) => {
        Promise.join(os.download(deviceType, version), os.getDownloadSize(deviceType, version))
        .spread((stream, size) => {
            fs.access(assetDir + '/resin.img', fs.constants.F_OK, (err) => {
                if (err) {
                    _download.start(100, 0);

                    var _progress = progress ({
                        length: size,
                        time: 1000
                    });

                    stream.pipe(_progress).pipe(fs.createWriteStream(assetDir + '/resin.img'));

                    _progress.on('progress', (data) => {
                        _download.update(data.percentage.toFixed(2));
                    });

                    stream.on('finish',  () => {
                        _download.update(100);
                        _download.stop();
                        resolve();
                    });

                    stream.on('error', reject);
                } else {
                    // Image was found in the asset dir, do not attempt download
                    resolve();
                }
            });
        });
    });
};

function writeImage(disk) {
    var _write = new bar.Bar({}, bar.Presets.shades_classic);
    var fd;

    return Promise.try(() => {
        return mountutils.unmountDiskAsync(disk);
    })
    .then(() => {
        return fs.openAsync(disk, 'rs+');
    })
    .then((driveFileDescriptor) => {
        fd = driveFileDescriptor;
        return emitter = imageWriter.write({
                    fd: fd,
                    device: disk,
                    size: 2014314496
                }, {
                    stream: fs.createReadStream(assetDir + '/resin.img'),
                    size: fs.statSync(assetDir + '/resin.img').size
                }, {
                    check: false
                });
    })
    .then((emitter) => {
        return new Promise((resolve, reject) => {
            _write.start(100, 0);
            emitter.on('progress', (state) => {
                _write.update(state.percentage.toFixed(2));
            });

            emitter.on('error', reject);
            emitter.on('done', (results) => {
                console.log(results);
                _write.stop();
                resolve();
            });
        });
    })
    .tap(() => {
        return fs.closeAsync(fd).then(() => {
            return Promise.delay(2000)
                .return(disk)
                .then(mountutils.unmountDiskAsync);
        });
	});
}

exports.provision = (appName, deviceType, version, disk, config) => {
    return getImage(deviceType, version)
        .then(() => {
            return resin.models.os.getConfig(appName, config);
        })
        .then((conf) => {
            return writeConfigure(conf);
        })
        .then(() => {
            return validateDisk(disk);
        })
        .then(writeImage);
}
