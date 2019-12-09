/*
 * Copyright 2018 balena
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

const merge = require('lodash/merge');

module.exports = class Context {
	constructor(context) {
		this.global = context;
		this.ctx = {};
	}

	set(obj) {
		merge(this.ctx, obj);
	}

	get() {
		if (this.global != null) {
			return { ...this.global.get(), ...this.ctx };
		}

		return this.ctx;
	}
};
