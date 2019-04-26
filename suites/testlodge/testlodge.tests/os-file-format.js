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

module.exports = {
  title: 'TC05 - Downloaded image format',
  run: async function(context) {
    const supervisorVersion = await context.balena.sdk.getSupervisorVersion(context.balena.uuid);
    const hostOsVersion = (await context.balena.sdk.getDeviceHostOSVersion(
      context.balena.uuid
    )).split(' ');

    console.log('HERE' + (await context.balena.sdk.getDeviceHostOSVersion(context.balena.uuid)));
    const downloadApi = context.os.download.source.split('.')[0];

    this.is(
      context.os.image.filename,
      `${downloadApi}-${context.deviceType.slug}-${hostOsVersion[1]}-v${supervisorVersion}.img`
    );
  }
};
