'use strict'

const path = require('path')

global.options = require(path.join(__dirname, 'user.json'))
global.assetDir = path.resolve(__dirname, '../assets')

global.provDevice = null
