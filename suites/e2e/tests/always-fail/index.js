/*
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

module.exports = {
  title: 'This test should be skipped',
  tests: [
    {
      title: 'Kill the device under test',
      run: async function (test) {
        await this.worker.instantKill("💥");
        test.notOk(
          true,
          `This test should have been skipped in the first place but didn't`,
        );
      },
    },
  ],
};
