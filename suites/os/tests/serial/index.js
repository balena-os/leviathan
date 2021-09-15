'use strict';

const { Bluebird } = require('Bluebird');
const { fs } = require('fs');

module.exports = {
	title: 'Serial Test',
	tests: [
		{
			title: 'Checking if serial works',
			run: async function(test) {
				await this.context.get().worker.on();
				await Bluebird.delay(10 * 1000);
				await this.context.get().worker.off();
				// We use a magic number, not extremely small to check we actually get the logs.

				fs.readFile();
				fs.readFile('/reports/dut-serial.txt', 'utf8', (err, data) => {
					if (err) throw new err
					if (data.length > 25) {
						console.log(data);
						test.true('We got serial log, bois.');
					}
				});
			},
		},
	],
};
