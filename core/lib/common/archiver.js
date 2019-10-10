/*
 * Copyright 2019 balena
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

const config = require('config');
const { copy, ensureDir } = require('fs-extra');
const { basename, join } = require('path');

module.exports = class Archiver {
  constructor(id) {
    this.location = join(config.get('leviathan.artifacts'), id);
    this.entries = [];
  }

  async add(artifactPath) {
    this.entries.push(artifactPath);
  }

  async commit() {
    if (this.entries.length > 0) {
      await ensureDir(this.location);

      while (this.entries.length > 0) {
        const entry = this.entries.pop();

        await copy(entry, join(this.location, basename(entry)));
      }
    }
  }
};
