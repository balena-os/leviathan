module.exports = {
  title: 'Connectivity tests',
  tests: [
    {
      title: 'Interface tests',
      tests: [
        {
          title: 'wifi',
          deviceType: {
            type: 'object',
            required: ['data'],
            properties: {
              data: {
                type: 'object',
                required: ['hdmi'],
                properties: {
                  hdmi: {
                    type: 'boolean',
                    const: true,
                  },
                },
              },
            },
          },
          os: {
            type: 'object',
            require: ['network'],
          },
          interactive: false,
          run: async function(test) {
            const adaptor = 'ethernet';
            const URL_TEST = 'google.com';

            const iface = await this.context.worker.executeCommandInHostOS(
              `nmcli d  | grep ' ${adaptor} ' | awk '{print $1}'`,
              this.context.link,
            );

            if (iface === '') {
              throw new Error(`No ${adaptor} interface found.`);
            }

            await this.context.worker.executeCommandInHostOS(
              `ping -c 10 -I ${iface} ${URL_TEST}`,
              this.context.link,
            );

            test.true(`${URL_TEST} responded over ${adaptor}`);
          },
        },
      ],
    },
  ],
};
