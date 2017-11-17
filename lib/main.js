'use strict'

const ava = require('ava')
const path = require('path')
const Bluebird = require('bluebird')
const os = require('os')
const git = require('nodegit')
const fse = require('fs-extra')

const resinio = require('./components/resinio/sdk')
const resinos = require('./components/resinos/simple')
const writer = require('./components/writer/etcher')

const options = require(path.join(__dirname, '../user.json'))
let provDevice = null

ava.test.before(() => {
  const imagePath = path.join(os.tmpdir(), 'resin.img')
  const applicationName = process.env.APPLICATION_NAME
  const configuration = {
    network: 'ethernet'
  }

  return resinio.loginWithToken(process.env.AUTH_TOKEN).then(() => {
    return resinio.hasApplication(applicationName)
  }).then((hasApplication) => {
    if (hasApplication) {
      return resinio.removeApplication(applicationName)
    }

    return Bluebird.resolve()
  }).then(() => {
    return resinio.createApplication(applicationName, options.deviceType)
  }).then(() => {
    return resinio.downloadDeviceTypeOS(options.deviceType, options.version, imagePath)
  }).then(() => {
    return resinio.getApplicationOSConfiguration(applicationName, configuration).then((applicationConfiguration) => {
      return resinos.injectResinConfiguration(imagePath, applicationConfiguration)
    })
  }).then(() => {
    return resinos.injectNetworkConfiguration(imagePath, configuration)
  }).then(() => {
    return writer.writeImage(imagePath, options.disk)
  })
})

ava.test.skip('device should become online', (test) => {
  return Bluebird.delay(10000)
    .return(process.env.APPLICATION_NAME)
    .then(resinio.getApplicationDevices)
    .then((devices) => {
      test.is(devices.length, 1)
      test.true(devices instanceof Array)
      return devices[0]
    })
    .then((device) => {
      provDevice = device.id
      return resinio.isDeviceOnline(device)
    }).then((isOnline) => {
      return test.true(isOnline)
    })
})

ava.test.skip('device should report hostOS version', (test) => {
  return resinio.getDeviceHostOSVersion(provDevice).then((version) => {
    test.is(version, 'Resin OS 2.0.6+rev3')
  })
})

ava.test.skip('should push an application', (test) => {
  let repository = null

  const repoPath = path.join(os.tmpdir(), 'test')
  return fse.remove(repoPath).then(() => {
    return git.Clone(options.gitAppURL, repoPath)
  }).then((repo) => {
    repository = repo
    return resinio.getApplicationGitRemote(process.env.APPLICATION_NAME)
  }).then((remote) => {
    return git.Remote.create(repository, 'resin', remote)
  }).then((remote) => {
    return remote.push([ 'refs/heads/master:refs/heads/master' ], {
      callbacks: {
        credentials: (url, user) => {
          return git.Cred.sshKeyFromAgent(user)
        }
      }
    })
  }).then(() => {
    return resinio.getDeviceCommit(provDevice).then((commit) => {
      return test.is(commit.length, 40)
    })
  })
})
