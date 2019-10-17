#!/usr/bin/env node

`use strict`;

process.env['NODE_CONFIG_DIR'] = `${__dirname}/../config`;
const config = require('config');

const ajv = new (require('ajv'))({ allErrors: true });
const balena = require('balena-sdk')({
  apiurl: config.get('balena.apiUrl'),
});
const blessed = require('blessed');
const { fork } = require('child_process');
const { ensureDir } = require('fs-extra');
const { fs } = require('mz');
const schema = require('../lib/schemas/multi-client-config.js');
const { Spinner } = require('../lib/visuals');
const { every, forEach } = require('lodash');
const { tmpdir } = require('os');
const { PassThrough } = require('stream');
const url = require('url');
const yargs = require('yargs')
  .usage('Usage: $0 [options]')
  .option('h', {
    alias: 'help',
    description: 'display help message',
  })
  .option('c', {
    alias: 'config',
    description: 'configuration file for the multi run client',
    required: true,
    type: 'string',
  })
  .option('w', {
    alias: 'workdir',
    description: 'working directory',
    type: 'string',
    default: `${tmpdir()}/run`,
  })
  .option('p', {
    alias: 'print',
    description: 'print all output to stdout',
    type: 'boolean',
    default: false,
  })
  .version()
  .help('help')
  .showHelpOnFail(false, 'Something went wrong! run with --help').argv;

(async () => {
  const mainStream = new PassThrough();

  try {
    await ensureDir(yargs.workdir);

    const runQueue = [];
    //Blessed setup for pretty terminal output
    if (process.stdout.isTTY === true) {
      // Hack our passtrhough stream in thinking it is tty
      mainStream.isTTY = true;
      var screen = blessed.screen({
        log: 'client.log',
        dump: true,
        smartCSR: true,
      });

      var layout = blessed.layout({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '100%',
        height: '100%',
        border: 'none',
      });

      var mainContainer = blessed.text({
        label: 'main',
        align: 'left',
        parent: layout,
        width: '99%',
        height: '99%',
        border: 'line',
        scrollable: true,
        alwaysScroll: true,
        style: {
          border: {
            fg: '#009933',
          },
          label: {
            fg: '#009933',
          },
        },
      });

      screen.key(['C-c'], function() {
        process.kill(process.pid, 'SIGINT');
      });

      screen.render();

      mainStream.on('data', data => {
        mainContainer.setContent(data.toString());
        screen.render();
      });
    } else {
      mainStream.pipe(process.stdout);
    }

    let runConfigs = require(yargs.config);

    const validate = ajv.compile(schema);

    if (!validate(runConfigs)) {
      throw new Error(
        `Invalid configuration -> ${ajv.errorsText(validate.errors)}`,
      );
    }

    runConfigs = runConfigs instanceof Object ? [runConfigs] : runConfigs;

    const queueSpinner = new Spinner('Computing Run Queue', mainStream);
    try {
      queueSpinner.start();

      for (const runConfig of runConfigs) {
        if (runConfig.workers instanceof Array) {
          runConfig.workers.forEach(workers => {
            runQueue.push({ ...runConfig, workers });
          });
        } else if (runConfig.workers instanceof Object) {
          await balena.auth.loginWithToken(runConfig.workers.apiKey);
          const tags = await balena.models.device.tags.getAllByApplication(
            runConfig.workers.balenaApplication,
          );

          for (const tag of tags.filter(tag => {
            return tag.tag_key === 'DUT' && tag.value === runConfig.deviceType;
          })) {
            if (!(await balena.models.device.hasDeviceUrl(tag.device.__id))) {
              throw new Error('Worker not publicly available. Panicking...');
            }
            runQueue.push({
              ...runConfig,
              workers: await balena.models.device.getDeviceUrl(tag.device.__id),
            });
          }
        }
      }
    } finally {
      queueSpinner.stop();
    }

    const runSpinner = new Spinner('Running Queue', mainStream);
    // Concurrent Run
    const children = {};
    runSpinner.start();

    process.on('exit', code => {
      process.exitCode = code || 1;

      if (Object.keys(children).length === 0) {
        console.log('No workers found...NO TESTS RAN');
      } else {
        process.exitCode =
          code ||
          every(children, child => {
            return child.code === 0;
          })
            ? 0
            : 1;

        if (yargs.print) {
          children.forEach(child => {
            console.log(`=====| ${child.outputPath}`);
            console.log(fs.readFileSync(child.outputPath));
            console.log(`=====`);
          });
        }
      }
    });
    // Make sure we pass down our signal
    ['SIGINT', 'SIGTERM'].forEach(signal => {
      process.on(signal, async sig => {
        const cleanSpinner = new Spinner('Cleaning up', mainStream);
        runSpinner.stop();
        cleanSpinner.start();
        const promises = [];
        forEach(children, child => {
          promises.push(
            new Promise(async (resolve, reject) => {
              try {
                const procInfo = (await fs.readFile(
                  '/proc/' + child._child.pid + '/status',
                )).toString();

                if (procInfo.match(/State:\s+[RSDT]/)) {
                  child._child.on('close', resolve);
                  child._child.on('error', reject);
                  child._child.kill(sig);
                } else {
                  resolve();
                }
              } catch (e) {
                resolve();
              }
            }),
          );
        });
        await Promise.all(promises);

        cleanSpinner.stop();
        if (screen != null) {
          screen.destroy();
        }

        process.exit(1);
      });
    });

    if (process.stdout.isTTY === true) {
      mainContainer.height = '7%';
      var containers = [];
      for (let i = 0; i < runQueue.length; ++i) {
        containers.push(
          blessed.log({
            align: 'left',
            parent: layout,
            width: `${99 / runQueue.length}%`,
            height: '93%',
            border: 'line',
            scrollOnInput: true,
            mouse: true,
            scrollbar: true,
            style: {
              scrollbar: {
                bg: 'white',
              },
            },
          }),
        );
      }
      screen.render();
    }

    // Keep track of our running children, essentially a watch dog
    let i = 0;
    const interval = setInterval(() => {
      if (!(i > 0)) {
        runSpinner.stop();
        clearInterval(interval);
      }
    }, 1000);
    while (runQueue.length > 0) {
      const run = runQueue.pop();
      const stream = new PassThrough();
      const child = fork(
        './single-client',
        [
          '-d',
          run.deviceType,
          '-i',
          run.image,
          '-c',
          run.config instanceof Object
            ? JSON.stringify(run.config)
            : run.config,
          '-s',
          run.suite,
          '-u',
          run.workers,
        ],
        {
          stdio: 'pipe',
          env: {
            CI: true,
          },
        },
      );
      ++i;
      // child state
      children[child.pid] = {
        _child: child,
        outputPath: `${yargs.workdir}/${url.parse(run.workers).hostname ||
          child.pid}.out`,
        exitCode: 1,
      };

      child.on('error', console.error);
      child.stdout.pipe(stream);
      child.stderr.pipe(stream);

      if (process.stdout.isTTY === true) {
        children[child.pid].container = containers[runQueue.length];
        children[child.pid].container.pushLine(`WORKER URL: ${run.workers}`);
        stream.on('data', data => {
          children[child.pid].container.pushLine(data.toString());
          screen.render();
        });
      }

      // Also stream our tests to their indiviual files
      stream.pipe(fs.createWriteStream(children[child.pid].outputPath));

      child.on('exit', code => {
        --i;
        children[child.pid].code = code;
      });
    }
  } catch (e) {
    mainStream.write(
      `ERROR ENCOUNTERED: ${e.message}. \n Killing process in 10 seconds...`,
    );
    await require('bluebird').delay(10000);
    process.kill(process.pid, 'SIGINT');
  }
})();
