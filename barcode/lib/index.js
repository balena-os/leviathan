//const rp = require('request-promise');
const WebSocket = require('ws');
const Bluebird = require('bluebird');
const { exec } = require('mz/child_process');
const fs = require('fs')

const CONFIG = `/data/config.json`
const REPORTS = `/reports/worker.log`

let success = false
const PAYLOAD = `ABCDEF` // to send to the test, can be the barcode value 

async function addPayload(payload){
    await new Promise((resolve, reject) => {
        let file = fs.readFileSync(CONFIG)
        let obj = JSON.parse(file.toString())
        obj["payload"] = payload;
        let json = JSON.stringify(obj)
        fs.writeFileSync(CONFIG, json);
        resolve()
    })  
}

const wsMessageHandler = ws => async pkg => {
    try {
        const { type, data } = JSON.parse(pkg);
        switch (type) {
            case 'log':
                // for now, stream these to the web terminal just to see whats going on
                console.log(data)
                break
            case 'status':
                // {success: true} or {success: false}
                if (data.success) {
                    success = true
                }
                break;
            case 'error':
                console.log(`Error:`)
                console.log(data)
                break;
            default:
                console.log(`Unexpected message received of type '${type}'`);
        }
    } catch (e) {
        console.log(e)
        ws.close();
    }
}

(async () => {
    while(true){
        // check for file to exist - this is just a way to manually start the tests for now as a placeholder
        try {
            const [stdout, stderr] = await exec('ls /tmp/start')
            console.log(`starting tests...`)
            await addPayload(PAYLOAD);
            // set success to false until we get a pass
            success = false
            
            // start the tests
            console.log(`Sending start signal to testrunner...`)
            const ws = new WebSocket(`ws://localhost/start`);
            const msgHandler = wsMessageHandler(ws);
            ws.on('message', msgHandler);
            
            // wait for ws to close
            await new Promise((resolve, reject) => {
                ws.on('close', () => {
                    console.log('WS connection is closed');
                    resolve()
                })
            })

            if(success){
                console.log(`Tests passed`)
            } else {
                console.log(`Tests failed`)
            }

            // remove the file
            await exec('rm /tmp/start')
        } catch(e) {
            //console.log(e.message)
            console.log(`Waiting for start signal...`)
            await Bluebird.delay(1000 * 10)
        }
    }
})()