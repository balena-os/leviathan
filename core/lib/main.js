import { BalenaCloudInteractor } from './balena';


const { fork } = require('child_process');
const config = require('config');
const { createWriteStream } = require('fs');

const { getSdk } = require('balena-sdk');
const logPath = `/reports/worker.log`;
const logStream = createWriteStream(logPath);

// need to take out the config part to give to the suite
(async () => {
    let runConfig = require('/usr/src/app/workspace/config.js');
    console.log(runConfig);
    runConfig = (runConfig instanceof Array) ? runConfig[0] : runConfig
    let workerUrl = '';
    if(!runConfig.workers instanceof Array){
        for(let i = 0; i<10; i++){
            const balena = getSdk({
                apiurl: "https://api.balena-cloud.com/",
            });

            console.log(`Getting URL of worker`);
            const balenaCloud = new BalenaCloudInteractor(balena);
            await balenaCloud.authenticate(runConfig.workers.apiKey);
            const matchingDevices = await balenaCloud.selectDevicesWithDUT(
                runConfig.workers.balenaApplication,
                runConfig.deviceType,
            );
            //  Throw an error if no matching workers are found.
            if (matchingDevices.length === 0) {
                throw new Error(
                    `No workers found for deviceType: ${runConfig.deviceType}`,
                );
            }

            for (var device of matchingDevices) {
                // check if device is idle & public URL is reachable
                deviceUrl = await balenaCloud.resolveDeviceUrl(device);
                try {
                    let status = await rp.get(
                        new url.URL('/state', deviceUrl).toString(),
                    );
                    if (status === 'IDLE') {
                        // reserve the device 
                        await rp.get(new url.URL('/start', deviceUrl).toString());
                        workerUrl = deviceUrl;
                        break
                    }
                } catch (err) {
                    state.info(
                        `Couldn't retrieve ${
                            device.tags ? device.tags.DUT : device
                        } worker's state. Querying ${deviceUrl} and received ${err.name}: ${
                            err.statusCode
                        }`,
                    );
                }
            }
            if(workerUrl !== ''){
                break
            }
            await require('bluebird').delay(25000);
        }
    } else {
        workerUrl = runConfig.workers[0]
    }

    runConfig.config["worker"] = workerUrl;
    runConfig.config["deviceType"] = runConfig.deviceType;

    // 
    // fork suite - should give config as an arg
    let suite = fork('./lib/common/suite', {
        stdio: 'inherit',
    });

    const suiteExitCode = await new Promise((resolve, reject) => {
        suite.on('error', reject);
        suite.on('exit', code => {
            console.log(`Suite exiting with code: ${code}`);
            resolve(code);
        });
    });

    const success = suiteExitCode === 0;
    if(success){
        console.log(`Result: PASS`)
        process.exitCode = 0
    } else {
        console.log(`Result: FAIL`)
        process.exitCode = 1
    }
    process.exit()
})();
