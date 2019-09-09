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
const { Mutex } = require('async-mutex');
const { forkCode, getFilesFromDirectory } = require('./common/utils');
const express = require('express');
const expressWebSocket = require('express-ws');
const { pathExists, remove } = require('fs-extra');
const md5 = require('md5-file/promise');
const { fs, crypto } = require('mz');
const { join } = require('path');
const tar = require('tar-fs');
const pipeline = Bluebird.promisify(require('stream').pipeline);
const { createGunzip } = require('zlib');
const WebSocket = require('ws');

async function setup() {
  const mutex = new Mutex();

  const location = '/data';
  let child = null;
  let release = null;

  const app = express();

  expressWebSocket(app, null, {
    perMessageDeflate: false
  });

  // Entry point for our process, aquire lock execution that syncronizes upload and start
  app.get('/aquire', async (_req, res) => {
    res.writeHead(202, {
      Connection: 'keep-alive'
    });
    res.connection.setTimeout(0);
    release = await mutex.acquire();
    res.end();
  });

  app.post('/upload', async (req, res) => {
    if (!mutex.isLocked) {
      throw new Error('Please call /upload to aquire lock execution');
    }

    res.writeHead(202, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive'
    });

    try {
      const artifact = {
        name: req.headers['x-artifact'],
        path: join(location, req.headers['x-artifact']),
        hash: req.headers['x-artifact-hash']
      };
      const ignore = ['node_modules', 'package-lock.json'];

      let hash = null;
      if (await pathExists(artifact.path)) {
        const stat = await fs.stat(artifact.path);

        if (stat.isFile()) {
          hash = await md5(artifact.path);
        }
        if (stat.isDirectory()) {
          const struct = await getFilesFromDirectory(artifact.path, ignore);

          const expand = await Promise.all(
            struct.map(async entry => {
              return {
                path: entry.replace(join(artifact.path, '/'), join(artifact.name, '/')),
                md5: await md5(entry)
              };
            })
          );

          expand.sort((a, b) => {
            const splitA = a.path.split('/');
            const splitB = b.path.split('/');
            return splitA.every((sub, i) => {
              return sub <= splitB[i];
            })
              ? -1
              : 1;
          });
          hash = crypto
            .Hash('md5')
            .update(
              expand.reduce((acc, value) => {
                return acc + value.md5;
              }, '')
            )
            .digest('hex');
        }
      }

      if (hash === artifact.hash) {
        res.write('upload: cache');
      } else {
        res.write('upload: start');
        // Make sure we start clean
        await remove(artifact.path);
        const line = pipeline(req, createGunzip(), tar.extract(location));
        req.on('close', () => {
          line.cancel();
        });
        await line;
        res.write('upload: done');
      }
    } catch (e) {
      if (release != null) {
        release();
        release = null;
      }
      res.write(`error: ${e.message}`);
    } finally {
      res.end();
    }
  });

  app.ws('/start', async (ws, req) => {
    process.env.CI = req.headers['sec-websocket-protocol'] === 'CI';

    // Keep the socket alive
    const interval = setInterval(function timeout() {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping('heartbeat');
      }
    }, 1000);

    try {
      if (!mutex.isLocked) {
        throw new Error('Please call /aquire to aquire lock execution');
      }

      await new Promise(resolve => {
        ws.on('error', console.error);
        ws.on('close', () => {
          clearInterval(interval);
          if (child != null) {
            child.kill('SIGINT');
          }
        });

        child = forkCode(
          `const Suite = require('${require.resolve('./common/suite')}');

          (async () => { 
            const suite = new Suite('${location}');
            await suite.init();
            suite.printRunQueueSummary();
            await suite.run();
          })()`,
          {
            stdio: 'pipe'
          }
        );

        ws.on('message', data => {
          child.stdin.write(data);
        });
        child.stdout.on('data', data => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                status: 'running',
                data: {
                  stdout: data
                }
              })
            );
          }
        });
        child.stderr.on('data', data => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                status: 'running',
                data: {
                  stdout: data
                }
              })
            );
          }
        });
        child.on('exit', code => {
          child = null;
          if (release != null) {
            release();
            release = null;
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                status: 'exit',
                data: {
                  code
                }
              })
            );
          }
          resolve();
        });
      });
    } catch (e) {
      if (release != null) {
        release();
        release = null;
      }
      console.error(e);
    } finally {
      ws.close();
    }
  });

  app.post('/stop', async (_req, res) => {
    try {
      if (!mutex.isLocked) {
        throw new Error('Please call /upload to aquire lock execution');
      }
      if (child != null) {
        child.on('exit', () => {
          res.send('OK');
        });
        child.kill('SIGINT');
      } else if (release != null) {
        release();
        release = null;
        res.send('OK');
      }
    } catch (e) {
      console.log(e);
      res.status(500);
      res.send(e.stack);
    }
  });

  return app;
}

(async function main() {
  const PORT = 80;

  const server = await setup();

  server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
})();
