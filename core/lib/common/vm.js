const m = require('module');
const vm = require('vm');
vm.runInThisContext(m.wrap(process.argv[2]))(exports, require, module, __filename, __dirname);
