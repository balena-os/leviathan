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
  constructor(message) {
    super(message);

    this.singelton = false;
  }

  update(state) {
    if (!process.env.CI) {
      super.update(state);
    } else {
      if (!this.singelton) {
        console.log(`${this._message}...[This will take a while]`);
        this.singelton ^= true;
      }
    }
  }
}

class CiSpinner extends Spinner {
  constructor(message) {
    super(message);
    this.message = message;
  }
  start() {
    if (!process.env.CI) {
      super.start();
    } else {
      console.log(`${this.message}...[This will take a while]`);
    }
  }

  stop() {
    if (!process.env.CI) {
      super.stop();
    } else {
      console.log('Done');
    }
  }
}

class CiSpinnerPromise extends SpinnerPromise {
  constructor(options = {}) {
    if (!process.env.CI) {
      // eslint-disable-next-line constructor-super
      return super(options);
    } else {
      console.log(`${options.startMessage}...[This will take a while]`);
      return options.promise.then(() => {
        console.log(options.stopMessage);
      });
    }
  }
}

module.exports = {
  Progress: CiProgress,
  Spinner: CiSpinner,
  SpinnerPromise: CiSpinnerPromise
};
