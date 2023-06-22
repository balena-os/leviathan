/*
 * Copyright 2017 balena
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const Bluebird = require('bluebird');
const { fork } = require('child_process');
const { getFilesFromDirectory } = require('./common/utils');
const config = require('./config.js');
const express = require('express');
const expressWebSocket = require('express-ws');
const { ensureDir, pathExists, remove } = require('fs-extra');
const md5 = require('md5-file');
const { fs, crypto } = require('mz');
const { basename, join } = require('path');
const tar = require('tar-fs');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const WebSocket = require('ws');
const { parse } = require('url'); // eslint-disable-line
const { createGzip, createGunzip } = require('zlib');
const setReportsHandler = require('./reports');
const MachineState = require('./state');
const { createWriteStream } = require('fs');

async function main() {
    // Handler definitions
    const stdHandler = data => {
       console.log(data.toString())
    }
    const msgHandler = message => {
        console.log(message)
    };


    // The reason we need to fork is because many 3rd party libariers output to stdout
    // so we need to capture that
    let suite = fork('./lib/common/suiteSubprocess', {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });
    suiteStarted = true;

    suite.stdout.on('data', stdHandler);
    suite.stderr.on('data', stdHandler);
    suite.on('message', msgHandler);

    const suiteExitCode = await new Promise((resolve, reject) => {
        suite.on('error', reject);
        suite.on('exit', code => {
            resolve(code);
        });
    });

    console.log(`Suite exit code is: ${suiteExitCode}`);
    const success = suiteExitCode === 0;
    if(success){
        console.log(`Test suite result: PASS`)
        process.exit(0)
    } else {
        console.log(`Test suite result: FAIL`)
        process.exit(suiteExitCode)
    }

};

	
main();
