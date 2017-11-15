'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const git = require('nodegit')
const fse = require('fs-extra')
const path = require('path')
const sdk = require('../components/resinio/sdk')

module.exports = () => {
  return {
    // eslint-disable-next-line prefer-arrow-callback
    describe: function () {
      // eslint-disable-next-line prefer-arrow-callback
      before(function () {
        let repository = null

        return fse.remove(path.resolve(global.assetDir, 'test')).then(() => {
          return git.Clone(global.options.gitAppURL, path.resolve(global.assetDir, 'test'))
        }).then((repo) => {
          repository = repo
          return sdk.getApplicationGitRemote(process.env.APPLICATION_NAME)
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
        })
      })

      // eslint-disable-next-line prefer-arrow-callback
      it(`Push: (${global.options.gitAppURL})`, function () {
        return sdk.getDeviceCommit(global.provDevice).then((commit) => {
          return chai.expect(commit).to.have.length(40)
        })
      })
    }
  }
}
