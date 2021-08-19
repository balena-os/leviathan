const { fork } = require('child_process');
const nativeFs = require('fs');
const yargs = require('yargs')
    .usage('Usage: $0 [options]')
    .option('p', {
        alias: 'path',
        type: 'string'
    })
    .option('h', {
		alias: 'help',
		description: 'display help message',
	})
    .version()
	.help('help')
	.showHelpOnFail(false, 'Something went wrong! run with --help').argv;


(async () => {
    var TSR = require('tap-mocha-reporter')
    let reportInput = nativeFs.createReadStream(yargs.path)
    let reportOutput = reportInput.pipe(TSR('spec'))

    let reportPromise = new Promise((resolve, reject) => {
        reportInput.on('end', () => {
            resolve()
        })
    })

    await reportPromise
})();