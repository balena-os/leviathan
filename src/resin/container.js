'use strict'

module.exports = (opt) => {
  return {
    // eslint-disable-next-line prefer-arrow-callback
    describe: function () {
      const application = global.resin.models.application

      const git = require('nodegit')
      const fse = require('fs-extra')
      const path = require('path')

      // eslint-disable-next-line prefer-arrow-callback
      before(function () {
        let repository = null

        return fse.remove(path.resolve(global.assetDir, 'test')).then(() => {
          return git.Clone(global.options.gitAppURL, path.resolve(global.assetDir, 'test'))
        }).then((repo) => {
          repository = repo
          return application.get(global.options.appName)
        }).then((app) => {
          return git.Remote.create(repository, 'resin', `telphan@git.resin.io:${app.git_repository}.git`)
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
        return global.expect(global.provDevice.commit).to.have.length(40)
      })
    }
  }
}
