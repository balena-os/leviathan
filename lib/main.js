'use strict'

const path = require('path')
const Bluebird = require('bluebird')
const os = require('os')
const git = require('nodegit')
const fse = require('fs-extra')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)

const resinio = require('./components/resinio/sdk')
const resinos = require('./components/resinos/simple')
const writer = require('./components/writer/etcher')

const options = require(path.join(__dirname, '../user.json'))
let provDevice = null

describe('Test ResinOS', function () {
  this.timeout(600000)

  // eslint-disable-next-line prefer-arrow-callback
  before(function () {
    this.imagePath = path.join(os.tmpdir(), 'resin.img')
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
      return resinio.downloadDeviceTypeOS(options.deviceType, options.version, this.imagePath)
    }).then(() => {
      return resinio.getApplicationOSConfiguration(applicationName, configuration).then((applicationConfiguration) => {
        return resinos.injectResinConfiguration(this.imagePath, applicationConfiguration)
      })
    }).then(() => {
      return resinos.injectNetworkConfiguration(this.imagePath, configuration)
    }).then(() => {
      return writer.writeImage(this.imagePath, options.disk)
    })
  })

  // eslint-disable-next-line prefer-arrow-callback
  xit('Device should become online', function () {
    this.retries(50)

    return Bluebird.delay(10000)
      .return(process.env.APPLICATION_NAME)
      .then(resinio.getApplicationDevices)
      .then((devices) => {
        chai.expect(devices).to.have.length(1)
        chai.expect(devices).to.be.instanceof(Array)
        return devices[0]
      })
      .then((device) => {
        provDevice = device.id
        return resinio.isDeviceOnline(device)
      }).then((isOnline) => {
        return chai.expect(isOnline).to.be.true
      })
  })

  // eslint-disable-next-line prefer-arrow-callback
  xit(`Device should report hostOS version: ${options.version}`, function () {
    return resinio.getDeviceHostOSVersion(provDevice).then((version) => {
      return chai.expect(version).to.equal('Resin OS 2.0.6+rev3')
    })
  })

  // eslint-disable-next-line prefer-arrow-callback
  xit('should push an application', function () {
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
        return chai.expect(commit).to.have.length(40)
      })
    })
  })
})
