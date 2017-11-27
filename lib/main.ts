'use strict'

import ava = require('ava')
import Bluebird = require('bluebird')
import fse = require('fs-extra')
import git = require('nodegit')
import path = require('path')

const TEMPORARY_DIRECTORY = path.join(__dirname, '..', '.tmp')
fse.ensureDirSync(TEMPORARY_DIRECTORY)

const options = <any>{
  deviceType: process.env.DEVICE_TYPE,
  resinOSVersion: process.env.RESINOS_VERSION,
  applicationName: process.env.APPLICATION_NAME,
  disk: process.env.DISK,
  email: process.env.EMAIL,
  password: process.env.PASSWORD
}

const utils = require('./utils')
const resinio = utils.requireComponent('resinio', 'sdk')
const resinos = utils.requireComponent('resinos', 'default')
const writer = utils.requireComponent('writer', 'etcher')
const deviceType = utils.requireComponent('device-type', options.deviceType)

ava.test.before(async () => {
  const imagePath = path.join(TEMPORARY_DIRECTORY, 'resin.img')
  const configuration = {
    network: 'ethernet'
  }

  console.log('Logging into resin.io')
  await resinio.loginWithCredentials({
    email: options.email,
    password: options.password
  })

  console.log(`Removing application: ${options.applicationName}`)
  await resinio.removeApplication(options.applicationName)

  console.log(`Creating application: ${options.applicationName} with device type ${options.deviceType}`)
  await resinio.createApplication(options.applicationName, options.deviceType)

  console.log('Downloading device type OS')
  await resinio.downloadDeviceTypeOS(options.deviceType, options.version, imagePath)

  console.log('Getting application OS configuration')
  const applicationConfiguration = await resinio.getApplicationOSConfiguration(options.applicationName, configuration)

  console.log(`Injecting resin.io configuration into ${imagePath}`)
  await resinos.injectResinConfiguration(imagePath, applicationConfiguration)

  console.log(`Injecting network configuration into ${imagePath}`)
  await resinos.injectNetworkConfiguration(imagePath, configuration)

  console.log(`Provisioning ${options.disk} with ${imagePath}`)
  await deviceType.provision(writer, imagePath, {
    destination: options.disk
  })

  console.log(`Waiting while device boots`)
  await Bluebird.delay(10000)
})

let provDevice = null

ava.test.skip('device should become online', async (test) => {
  const devices = await resinio.getApplicationDevices(options.applicationName)
  test.is(devices.length, 1)
  test.true(devices instanceof Array)
  provDevice = devices[0].id
  const isOnline = await resinio.isDeviceOnline(devices[0])
  test.true(isOnline)
})

ava.test.skip('device should report hostOS version', async (test) => {
  const version = await resinio.getDeviceHostOSVersion(provDevice)
  test.is(version, 'Resin OS 2.0.6+rev3')
})

ava.test.skip('should push an application', async (test) => {
  const repositoryPath = path.join(TEMPORARY_DIRECTORY, 'test')
  await fse.remove(repositoryPath)
  const repository = await git.Clone('https://github.com/alexandrosm/hello-python', repositoryPath)
  const remote = await resinio.getApplicationGitRemote(options.applicationName)
  await git.Remote.create(repository, 'resin', remote)
  await remote.push([ 'refs/heads/master:refs/heads/master' ], {
    callbacks: {
      credentials: (_url, user) => {
        return git.Cred.sshKeyFromAgent(user)
      }
    }
  })

  const commit = await resinio.getDeviceCommit(provDevice)
  test.is(commit.length, 40)
})
