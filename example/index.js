const Bluebird = require('bluebird');
const retry = require('bluebird-retry');
const { exists } = require('fs-extra');
const md5 = require('md5-file/promise');
const { fs, crypto } = require('mz');
const { constants } = require('os');
const { basename, dirname, isAbsolute, join } = require('path');
const progStream = require('progress-stream');
const request = require('request');
const rp = require('request-promise');
const pipeline = Bluebird.promisify(require('readable-stream').pipeline);
const { PassThrough } = require('stream');
const tar = require('tar-fs');
const tarStream = require('tar-stream');
const { parse } = require('url');
const WebSocket = require('ws');
const zlib = require('zlib');



const wsMessageHandler = ws => async pkg => {
    try {
        const { type, data } = JSON.parse(pkg);
        switch (type) {
            case 'log':
                console.log(data);
                break;
            case 'status':
                if (!data.success) {
                    console.log("Tests Failed")
                }
                break;
            case 'error':
                console.log("Error while running tests")
                break;
            default:
                console.log(`Unexpected message received of type '${type}'`);
        }
    } catch (e) {
        ws.close();
    }
};

const createWs = () => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:80/start`);

    const msgHandler = wsMessageHandler(ws);
    ws.on('message', msgHandler);

    const initialErrorHandler = e => {
        ws.off('ping', initialPingHandler);
        reject(e);
    };
    const initialPingHandler = () => {
        ws.pong('heartbeat');
        ws.off('error', reject);
        resolve(ws);
    };

    ws.once('error', initialErrorHandler);
    ws.once('ping', initialPingHandler);
});




const main = async () => {
    process.on('SIGINT', async () => {
        await rp.post(`${this.uri.href}stop`).catch(this.log.bind(this));
        process.exit(128 + constants.signals.SIGINT);
    });
    process.on('SIGTERM', async () => {
        await rp.post(`${this.uri.href}stop`).catch(this.log.bind(this));
        process.exit(128 + constants.signals.SIGTERM);
    });

    // Try establishing the WS multiple times.
    const ws = await retry(createWs, { max_tries: 3 });

    // Keep the websocket alive
    ws.on('ping', () => ws.pong('heartbeat'));

    // And then await till it's closed.
    await new Promise((resolve, reject) => {
        ws.on('error', e => {
            this.log(`WS connection error: ${e.name} ${e.message}`);
            reject(e);
        });
        ws.on('close', () => {
            this.log('WS connection is closed');
            process.stdin.destroy();
            if (capturedError) {
                reject(capturedError);
            } else {
                resolve();
            }
        });
    });
};


//start up
main();
