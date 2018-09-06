/*
 * Copyright 2017 resin.io
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
  run: async (test, context, options, components) => {
    // Get supervisor update info
    const supervisorImage = await components.resinio.sshHostOS(
      'source /etc/resin-supervisor/supervisor.conf ; echo $SUPERVISOR_IMAGE',
      context.uuid,
      context.key.privateKeyPath
    )
    const supervisorTag = await components.resinio.sshHostOS(
      'source /etc/resin-supervisor/supervisor.conf ; echo $SUPERVISOR_TAG',
      context.uuid,
      context.key.privateKeyPath
    )

    // Get config.json path
    const configPath = await components.resinio.sshHostOS(
      'systemctl show config-json.path --no-pager | grep PathChanged | cut -d \'=\' -f 2',
      context.uuid,
      context.key.privateKeyPath
    )

    test.isNot(supervisorImage, '')
    test.isNot(supervisorTag, '')
    test.isNot(configPath, '')

    // Get config.json content
    const config = JSON.parse(await components.resinio.sshHostOS(
      `cat ${configPath}`,
      context.uuid,
      context.key.privateKeyPath
    ))

    // Get Supervisor ID
    const supervisorId = await components.resinio.sshHostOS(
      'curl -s ' +
      `"${config.apiEndpoint}/v3/supervisor_release?` +
        '\\$select=id,image_name&' +
        `\\$filter=((device_type%20eq%20'${config.deviceType}')%20and%20(supervisor_version%20eq%20'${supervisorTag}'))&` +
        `apikey=${config.deviceApiKey}" ` +
      '| jq -e -r \'.d[0].id\'',
      context.uuid,
      context.key.privateKeyPath
    )

    test.resolveMatch(components.resinio.sshHostOS(
      'curl -s ' +
      `"${config.apiEndpoint}/v2/device(${config.deviceId})?apikey=${config.deviceApiKey}" ` +
      '-X PATCH ' +
      `--data-urlencode "supervisor_release=${supervisorId}"`,
      context.uuid,
      context.key.privateKeyPath
    ), 'OK')
    test.resolveMatch(components.resinio.sshHostOS(
      'update-resin-supervisor | grep "Supervisor configuration found from API"',
      context.uuid,
      context.key.privateKeyPath
    ), 'Supervisor configuration found from API')
  }
}
