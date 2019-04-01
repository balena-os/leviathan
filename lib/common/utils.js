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

require('any-promise/register/bluebird');

const flow = require('lodash/fp/flow');
const zip = require('lodash/fp/zip');
const filter = require('lodash/fp/filter');
const isEqual = require('lodash/isEqual');
const every = require('lodash/fp/every');
const isEmpty = require('lodash/isEmpty');
const forEach = require('lodash/forEach');
const trim = require('lodash/trim');
const has = require('lodash/has');
const includes = require('lodash/includes');
const split = require('lodash/split');
const indexOf = require('lodash/indexOf');
const noop = require('lodash/noop');
const assignIn = require('lodash/assignIn');
const assign = require('lodash/assign');
const replace = require('lodash/replace');

const Bluebird = require('bluebird');
const exec = Bluebird.promisify(require('child_process').exec);
const { fs } = require('mz');
const fse = require('fs-extra');
const inquirer = require('inquirer');
const git = require('simple-git/promise');
const keygen = Bluebird.promisify(require('ssh-keygen'));
const path = require('path');
const semver = require('resin-semver');
const repl = require('repl');
const SSH = require('node-ssh');
const sdk = require('etcher-sdk');

const waitProgressCompletion = async (promise, terminate, _times = 0, _delay = 30000) => {
  if (_times > 20) {
    throw new Error(`Progress for ${promise} has timed out`);
  }

  if (await terminate()) {
    return Bluebird.resolve();
  }

  const initial = await promise();

  await Bluebird.delay(_delay);

  const step = await promise();

  await Bluebird.delay(_delay);

  if (
    flow([
      zip,
      filter(pair => {
        return !isEqual(pair, [null, null]);
      }),
      every(([i, s]) => {
        return s - i === 0;
      })
    ])(initial, step)
  ) {
    return waitProgressCompletion(promise, terminate, _times + 1);
  }

  return waitProgressCompletion(promise, terminate);
};

const printInstructionsSet = (title, instructions) => {
  if (isEmpty(instructions)) {
    return;
  }

  console.log(`==== ${title}`);

  forEach(instructions, instruction => {
    console.log(`- ${instruction}`);
  });
};

const cloneRepo = async options => {
  await fse.remove(options.path);
  await git().clone(options.url, options.path);
};

const pushRepo = async options => {
  const GIT_SSH_COMMAND = 'ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no';

  await git(options.repo.path).addRemote(options.repo.remote.name, options.repo.remote.url);
  await git(options.repo.path)
    .env({
      SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK,
      GIT_SSH_COMMAND
    })
    .push(options.repo.remote.name, options.repo.branch.name, {
      '--force': null
    });

  return trim(await git(options.repo.path).revparse([options.repo.branch.name]));
};

const getTunnelDisposer = config => {
  const getTunnel = ({ socket, host, port, proxyAuth }) => {
    return new Bluebird((resolve, reject) => {
      let tunnelProxyResponse = '';

      socket.on('error', error => {
        let errorLine = `Could not connect to ${host}:${port} tunnel`;
        if (has(error, 'message')) {
          errorLine += `: ${error.message}`;
        }

        reject(new Error(errorLine));
      });

      socket.on('end', () => {
        const errorLine = new Error(
          `Could not connect to ${host}:${port} tunneling socket closed prematurely`
        );
        reject(errorLine);
      });

      socket.on('data', chunk => {
        if (chunk !== null) {
          tunnelProxyResponse += chunk.toString();
        }

        if (!includes(tunnelProxyResponse, '\r\n\r\n')) {
          return;
        }

        let httpStatusLine = split(tunnelProxyResponse, '\r\n')[0];
        const httpStatusCode = parseInt(split(httpStatusLine, ' ')[1], 10);

        if (httpStatusCode === 407) {
          httpStatusLine = 'HTTP/1.0 403 Forbidden';
        }

        if (httpStatusCode !== 200) {
          const errorLine = new Error(
            `Could not establish socket connection to ${host}:${port} - ${httpStatusLine}`
          );
          reject(errorLine);
        }

        resolve(socket);
      });

      // Write the request
      socket.write(`CONNECT ${host}:${port} HTTP/1.0\r\n`);

      if (proxyAuth) {
        socket.write(`Proxy-Authorization: Basic ${Buffer.from(proxyAuth).toString('base64')}\r\n`);
      }

      socket.write('\r\n\r\n');
    });
  };

  return getTunnel(config).disposer(socket => {
    socket.destroy();
  });
};

const getSSHClientDisposer = config => {
  const createSSHClient = conf => {
    return Bluebird.resolve(
      new SSH().connect(
        assignIn(
          {
            agent: process.env.SSH_AUTH_SOCK
          },
          conf
        )
      )
    );
  };

  return createSSHClient(config).disposer(client => {
    client.dispose();
  });
};

const self = (module.exports = {
  executeCommandOverSSH: async (command, config, tunnelConfig) => {
    return Bluebird.using(getTunnelDisposer(tunnelConfig), () => {
      return Bluebird.using(getSSHClientDisposer(config), client => {
        return client.exec(command, [], {
          stream: 'both'
        });
      });
    });
  },

  getWorker: worker => {
    const WORKER_DIRECTORY = './workers';

    try {
      return require(`${WORKER_DIRECTORY}/${worker}`);
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        return require(`${WORKER_DIRECTORY}/manual`);
      }
      throw error;
    }
  },

  waitUntil: async (promise, _times = 0, _delay = 30000) => {
    if (_times > 20) {
      throw new Error(`Condition ${promise} timed out`);
    }

    if (await promise()) {
      return Bluebird.resolve();
    }

    await Bluebird.delay(_delay);

    return self.waitUntil(promise, _times + 1);
  },
  runManualTestCase: async testCase => {
    // Some padding space to make it easier to the eye
    await Bluebird.delay(50);
    printInstructionsSet('PREPARE', testCase.prepare);
    printInstructionsSet('DO', testCase.do);
    printInstructionsSet('ASSERT', testCase.assert);
    printInstructionsSet('CLEANUP', testCase.cleanup);

    return (await inquirer.prompt([
      {
        type: 'confirm',
        name: 'result',
        message: 'Did the test pass?',
        default: false
      }
    ])).result;
  },

  getDeviceUptime: async connection => {
    const start = process.hrtime()[0];
    const uptime = await connection("cut -d ' ' -f 1 /proc/uptime");

    return Number(uptime) - (start - process.hrtime()[0]);
  },

  clearHandlers: events => {
    forEach(events, event => {
      process.on(event, noop);
    });
  },
  resolveVersion: async (supported, versionRaw = 'latest') => {
    const KEYWORDS = ['recommended', 'latest', 'default'];
    const version = trim(versionRaw, 'v');

    if (semver.valid(version)) {
      const index = indexOf(supported.versions, version);

      if (index !== -1) {
        return supported.versions[index];
      }
    }

    if (includes(KEYWORDS, version)) {
      return supported[version];
    }

    throw new Error('Keyword not recognized or invalid version provided');
  },

  pushAndWaitRepoToBalenaDevice: async options => {
    await cloneRepo({
      path: options.path,
      url: options.url
    });

    const hash = await pushRepo({
      repo: {
        remote: {
          name: 'balena',
          url: await options.balena.sdk.getApplicationGitRemote(options.applicationName)
        },
        branch: {
          name: 'master'
        },
        path: options.path
      }
    });

    await waitProgressCompletion(
      async () => {
        return options.balena.sdk.getAllServicesProperties(options.uuid, 'download_progress');
      },
      async () => {
        const services = await options.balena.sdk.getAllServicesProperties(options.uuid, [
          'status',
          'commit'
        ]);

        if (isEmpty(services)) {
          return false;
        }

        return every(
          {
            status: 'Running',
            commit: hash
          },
          services
        );
      }
    );

    return hash;
  },

  moveDeviceToApplication: async options => {
    await options.balena.sdk.moveDeviceToApplication(options.uuid, options.applicationName);

    await waitProgressCompletion(
      async () => {
        return options.balena.sdk.getAllServicesProperties(options.uuid, 'download_progress');
      },
      async () => {
        const services = await options.balena.sdk.getAllServicesProperties(options.uuid, [
          'status',
          'commit'
        ]);

        if (isEmpty(services)) {
          return false;
        }

        return every(
          {
            status: 'Running'
          },
          services
        );
      }
    );
  },

  pushRepoToApplication: async options => {
    await cloneRepo({
      path: options.path,
      url: options.url
    });

    return pushRepo({
      repo: {
        remote: {
          name: 'balena',
          url: await options.balena.sdk.getApplicationGitRemote(options.applicationName)
        },
        branch: {
          name: 'master'
        },
        path: options.path
      }
    });
  },

  repl: (context, options) => {
    return new Bluebird((resolve, reject) => {
      const prompt = repl.start({
        prompt: `${options.name} > `,
        useGlobal: true,
        terminal: true
      });

      assign(prompt.context, context);

      prompt.on('exit', () => {
        resolve();
      });
    });
  },

  searchAndReplace: async (filePath, regex, replacer) => {
    const content = await fs.readFile(filePath, 'utf-8');
    return fs.writeFile(filePath, replace(content, regex, replacer), 'utf-8');
  },

  createSSHKey: keyPath => {
    return fs
      .access(path.dirname(keyPath))
      .then(async () => {
        const keys = await keygen({
          location: keyPath
        });
        await exec(`ssh-add ${keyPath}`);
        return keys;
      })
      .get('pubKey');
  },
  promiseStream: stream => {
    return new Bluebird((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  },
  getDrive: async device => {
    const adapter = new sdk.scanner.adapters.BlockDeviceAdapter(() => false);
    const scanner = new sdk.scanner.Scanner([adapter]);

    await scanner.start();

    let drive;

    try {
      drive = scanner.getBy('device', device);
    } finally {
      scanner.stop();
    }
    if (!(drive instanceof sdk.sourceDestination.BlockDevice)) {
      throw new Error(`Cannot find ${device}`);
    }

    return drive;
  }
});
