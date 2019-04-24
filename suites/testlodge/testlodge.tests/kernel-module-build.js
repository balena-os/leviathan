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

const path = require('path');

module.exports = {
  title: 'TC39 - Kernel module build',
  run: async function(context) {
    const clonePath = path.join(context.tmpdir, 'kernel-module-build');

    await context.utils.cloneRepo({
      path: clonePath,
      url: 'https://github.com/balena-io-projects/kernel-module-build.git'
    });

    await context.utils.searchAndReplace(
      path.join(clonePath, 'build.sh'),
      "'https://files.balena-cloud.com'",
      "'https://files.balena-staging.com'"
    );
    await context.utils.searchAndReplace(
      path.join(clonePath, 'Dockerfile.template'),
      "'2.29.0+rev1.prod'",
      `'${context.os.image.version}'`
    );

    await context.utils.addAndCommit(clonePath, 'Configuration');

    const hash = await context.utils.pushWaitRepoToBalenaDevice({
      path: clonePath,
      uuid: context.balena.uuid,
      balena: context.balena,
      applicationName: context.balena.application.name
    });

    this.is(await context.balena.sdk.getDeviceCommit(context.balena.uuid), hash);

    const deviceLogs = (await context.utils.getDeviceLogs({
      balena: context.balena,
      uuid: context.balena.uuid
    })).map(elment => {
      return elment.message;
    });

    this.notMatch([deviceLogs], [/insmod: ERROR/], 'Device logs shouldn\'t output "insmod: ERROR"');
    this.notMatch([deviceLogs], [/rmmod: ERROR/], 'Device logs shouldn\'t output "rmmod: ERROR"');
    this.notMatch(
      [deviceLogs],
      [/could not load module/],
      'Device logs shouldn\'t output "could not load module"'
    );
    this.match([deviceLogs], [/hello/], 'Device logs output "hello"');
    this.match([deviceLogs], [/done!/], 'Device logs output "done!');

    const dmesgDeviceLogs = await context.balena.sdk.executeCommandInHostOS(
      'dmesg -T',
      context.balena.uuid
    );

    this.match([dmesgDeviceLogs], [/Hello World!/], 'Dmesg logs output "Hello World!"');
  }
};
