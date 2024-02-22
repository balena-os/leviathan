/*
 * Copyright 2024 balena
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

const { spawn } = require("child_process");

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const retry = require('bluebird-retry');
const config = require('../config');
const { join } = require('path');

// Function for generating SHA-256 checksum
function generateChecksum(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('MD5'); 
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (error) => reject(error));
  });
}

module.exports = {

  /**
   * Download a file with `curl` and display download progress.
   * @param {string} downloadUrl - The URL to download the file from.
   * @param {string[]} otherArgs - Optional arguments to pass to curl.
   *
   * Context: https://www.jenkins.io/doc/book/system-administration/authenticating-scripted-clients/
   */
  downloadFromUrl: async function (downloadUrl, otherArgs = []) {
    const downloadFileName = new URL(downloadUrl).pathname.split('/').pop()
    const downloadHost = new URL(downloadUrl).hostname
    const downloadPath = join(
      config.leviathan.downloads,
      `${downloadFileName}`,
    );

    // Prepare curl command with necessary options
    const args = [
      // "-vvv", // Debugging options
      '--silent', "--show-error", // No Progress Bar
      '-C', '-', '--fail', // Fail options
      '--connect-timeout', '1060', '--keepalive-time', '1060', // Timeout options
      '-H', 'accept-encoding: gzip, deflate', // Headers
      '-O', '--output-dir', config.leviathan.downloads, // Output options
      downloadUrl, // Auth options
      ...otherArgs // Custom options
    ]

    return retry(() => {
        return new Promise((resolve, reject) => {
          const curl = spawn('curl', args);
          console.log(`Download started from ${downloadHost}... `);

          curl.stdout.on('data', (data) => {
            console.log(`${data}`);
          });

          curl.stderr.on('data', (data) => {
            // To get any logs disable silent option
            console.log(`${data}`); // Display progress data from curl, even errors
          });

          // when the spawn child process exits, check if there were any errors
          curl.on('exit', function (code, signal) {
            if (code != 0) {
              reject(`received code ${code} and signal ${signal}`)
            }
          });

          curl.on('close', async (code, signal) => {
            if (code === 0) {
              console.log(`File downloaded to ${downloadPath}. File size: ${fs.statSync(downloadPath).size / (1024 * 1024)} MB`);  // Size in Megabytes
              console.log(`Downloaded file checksum: ${await generateChecksum(downloadPath)}`);
              resolve(downloadPath);
            } else {
              reject(`received code ${code} and signal ${signal}`)
            }
          }),
          {
            max_tries: 3,
          }
        })
      })
  }
}
