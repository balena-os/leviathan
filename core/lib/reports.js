const fs = require('fs');
const path = require('path');

const possibleReports = {
	'dut-serial.txt': 'text/plain',
	'test-summary.json': 'text/plain'
};

const notFound = resp => {
	resp.status(404);
	resp.send({ message: 'Report is not available' });
};

const basePath = '/reports';

module.exports = app =>
	app.get('/reports/:name', (req, resp) => {
		const name = req.params.name;
		if (!possibleReports[name]) {
			notFound(resp);
			return;
		}

		const reportPath = path.join(basePath, name);
		fs.readFile(reportPath, (err, data) => {
			if (err) {
				if (err.code === 'ENOENT') {
					notFound(resp);
					return;
				}
				console.error(`Unable to read ${reportPath}`, reportPath);
				resp.status(500);
				resp.send({ message: 'Cannot read the requested report' });
				return;
			}

			resp.setHeader('content-type', possibleReports[name]);
			resp.status(200);
			resp.send(data);
		});
	});
