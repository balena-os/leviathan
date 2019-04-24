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

module.exports = {
  title: 'TC26 - Supervisor reload test',
  run: async function(context) {
    // Delete current supervisor
    await context.balena.sdk.executeCommandInHostOS(
      'systemctl stop resin-supervisor',
      context.balena.uuid
    );
    await context.balena.sdk.executeCommandInHostOS(
      'balena rm resin_supervisor',
      context.balena.uuid
    );
    await context.balena.sdk.executeCommandInHostOS(
      `balena rmi -f $(balena images | grep -E "(balena|resin)"/${
        context.deviceType.data.arch
      }-supervisor | awk '{print $3}')`,
      context.balena.uuid
    );
    this.rejects(context.balena.sdk.pingSupervisor(context.balena.uuid));

    // Pull and start the supervisor
    await context.balena.sdk.executeCommandInHostOS('update-resin-supervisor', context.balena.uuid);

    // Wait for the supervisor to be marked as healthy
    await context.utils.waitUntil(async () => {
      return (
        (await context.balena.sdk.executeCommandInHostOS(
          "balena inspect --format '{{.State.Health.Status}}' resin_supervisor",
          context.balena.uuid
        )) === 'healthy'
      );
    });

    this.resolves(context.balena.sdk.pingSupervisor(context.balena.uuid));
  }
};
