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

// This is just wrapper module to provide safe CI visuals
// Only using Progress Spinner and SpinnerPromise
const { Progress, Spinner, SpinnerPromise } = require('resin-cli-visuals');

class CiProgress extends Progress {
  constructor(message, stream = process.stdout) {
    super(message, stream);

    this.singelton = false;
  }

  update(state) {
    if (process.env.CI !== 'true') {
      super.update(state);
    } else {
      if (!this.singelton) {
        this._stream.write(`${this._message}...[This will take a while]\n`);
        this.singelton ^= true;
      }
    }
  }
}

class CiSpinner extends Spinner {
  start() {
    if (process.env.CI !== 'true') {
      super.start();
    } else {
      this.spinner.stream.write(
        `${this.spinner.text}...[This will take a while]\n`,
      );
    }
  }

  stop() {
    if (process.env.CI !== 'true') {
      super.stop();
    } else {
      this.spinner.stream.write('Done\n');
    }
  }
}

class CiSpinnerPromise extends SpinnerPromise {
  constructor(options = {}, stream = process.stdout) {
    if (process.env.CI !== 'true') {
      // eslint-disable-next-line constructor-super
      return super(options, stream);
    } else {
      stream.write(`${options.startMessage}...[This will take a while]\n`);
      return options.promise.then(result => {
        stream.write(options.stopMessage);
        return result;
      });
    }
  }
}

module.exports = {
  Progress: CiProgress,
  Spinner: CiSpinner,
  SpinnerPromise: CiSpinnerPromise,
};
