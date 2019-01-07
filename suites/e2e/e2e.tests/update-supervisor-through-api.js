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

'use strict'

module.exports = {
  title: 'Update supervisor through the API',
  run: async function (context) {
    // Get supervisor update info
    const supervisorImage = await context.balena.sdk.executeCommandInHostOS(
      'source /etc/resin-supervisor/supervisor.conf ; echo $SUPERVISOR_IMAGE',
      context.balena.uuid
    )
    const supervisorTag = await context.balena.sdk.executeCommandInHostOS(
      'source /etc/resin-supervisor/supervisor.conf ; echo $SUPERVISOR_TAG',
      context.balena.uuid
    )

    // Get config.json path
    const configPath = await context.balena.sdk.executeCommandInHostOS(
      'systemctl show config-json.path --no-pager | grep PathChanged | cut -d \'=\' -f 2',
      context.balena.uuid
    )

    this.isNot(supervisorImage, '')
    this.isNot(supervisorTag, '')
    this.isNot(configPath, '')

    // Get config.json content
    const config = JSON.parse(await context.balena.sdk.executeCommandInHostOS(
      `cat ${configPath}`,
      context.balena.uuid
    ))

    // Get Supervisor ID
    const supervisorId = (await context.balena.sdk.pine.get({
      resource: 'supervisor_release',
      options: {
        $select: 'id',
        $filter: {
          device_type: context.deviceType.slug,
          supervisor_version: supervisorTag
        }
      }
    }))[0].id

    this.is(await context.balena.sdk.pine.patch({
      resource: 'device',
      id: config.deviceId,
      body: {
        should_be_managed_by__supervisor_release: supervisorId
      }
    }), 'OK')

    this.resolveMatch(context.balena.sdk.executeCommandInHostOS(
      'update-resin-supervisor | grep "Supervisor configuration found from API"',
      context.balena.uuid
    ), 'Supervisor configuration found from API')
  }
}
