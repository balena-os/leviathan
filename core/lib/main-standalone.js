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

const { fork } = require('child_process');

(async function main() {			
	// The reason we need to fork is because many 3rd party libariers output to stdout
	// so we need to capture that
	suite = fork('./lib/common/suiteSubprocess', {
		stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
	});
				
	suite.stdout.on('data', (data) =>{
		console.log(data)
	});
	suite.stderr.on('data', (data) => {
		console.log(data)
	});
	suite.on('message', (message) => {
		console.log(`Message: ${message}`)
	});


	try{
		const suiteExitCode = await new Promise((resolve, reject) => {
			suite.on('error', reject);
			suite.on('exit', code => {
				console.log(`exiting suite...`);
				resolve(code);
			});
		});

		console.log(`Suite exit code is: ${suiteExitCode}`);
		const success = suiteExitCode === 0;
		if(success){
			console.log(`Test result: PASS`)
			process.exit(0)
		} else {
			console.log(`Test result: FAIL`)
			process.exit(suiteExitCode)
		}
	} catch (e) {
		console.log(`Error while runnign test suite... exiting`)
		process.exit(127)
	}	
})();
