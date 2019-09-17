#!/usr/bin/env node

process.env['NODE_CONFIG_DIR'] = `${__dirname}/../config`;
const config = require('config');

const ajv = new (require('ajv'))({ allErrors: true });
const balena = require('balena-sdk')({
  apiUrl: config.get('balena.apiUrl'),
});
const { fork } = require('child_process');
const schema = require('../lib/schemas/multi-client-config.json');
const { Spinner } = require('../lib/visuals');
const { every, forEach } = require('lodash');
const { tmpdir } = require('os');
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

  .version()
  .help('help')
  .showHelpOnFail(false, 'Something went wrong! run with --help').argv;

(async () => {
  const runQueue = [];

  const runConfigs = require(yargs.config);
  const validate = ajv.compile(schema);

  if (!validate(runConfigs)) {
    throw new Error(
      `Invalid configuration -> ${ajv.errorsText(validate.errors)}`,
    );
  }

  const queueSpinner = new Spinner('Computing Run Queue');
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
        return (
          tag.tag_key === 'DUT' && tag.value === runConfig.workers.deviceType
        );
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
  queueSpinner.stop();

  const runSpinner = new Spinner('Running Queue');
  // Concurrent Run
  const children = {};
  runSpinner.start();

  process.on('exit', () => {
    process.exitCode = every(children, child => {
      return child.code === 0;
    })
      ? 0
      : 1;
    console.log();
    forEach(children, (child, pid) => {
      console.log('================================================');
      console.log(`${pid} finished: ${child.code}`);
      console.log('================================================');
      console.log(child.output);
      console.log('================================================');
    });
  });
  // Make sure we pass down our signal
  ['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, async sig => {
      const promises = [];
      forEach(children, child => {
        promises.push(
          new Promise((resolve, reject) => {
            child._child.on('close', resolve);
            child._child.on('error', reject);
          }),
        );
        child._child.kill(sig);
      });
      await Promise.all(promises);
      process.exit(1);
    });
  });

  // Keep track of our running children
  let i = 0;
  const interval = setInterval(() => {
    if (!(i > 0)) {
      runSpinner.stop();
      clearInterval(interval);
    }
  }, 1000);
  while (runQueue.length > 0) {
    const run = runQueue.pop();
    // We start the child in CI mode so we do not polute our output as we do not run
    // in a active tty, we should rename CI to something more appropriate for this use case
    const child = fork(
      './single-client',
      [
        '-i',
        run.image,
        '-c',
        run.config instanceof Object ? JSON.stringify(run.config) : run.config,
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
    // child state
    children[child.pid] = {
      _child: child,
      output: '',
      exitCode: 1,
    };
    ++i;

    child.on('error', console.error);
    child.stdout.on('data', data => {
      children[child.pid].output += data.toString('utf-8');
    });
    child.stderr.on('data', data => {
      children[child.pid].output += data.toString('utf-8');
    });
    child.on('exit', code => {
      --i;
      children[child.pid].code = code;
    });
  }
})();
