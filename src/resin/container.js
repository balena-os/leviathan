'use strict';

module.exports = function (opt) {
    return {
        describe: function() {
            const application = resin.models.application;

            const git = require('nodegit');
            const fse = require('fs-extra');
            const path = require('path');

            before(function () {
                var repository;

                return fse.remove(path.resolve(assetDir, 'test'))
                .then(function () {
                    return git.Clone(options.gitAppURL, path.resolve(assetDir, 'test'));
                })
                .then(function (repo) {
                    repository = repo;
                    return application.get(options.appName);
                })
                .then(function (app) {
                    return git.Remote.create(repository, 'resin', `telphan@git.resin.io:${app.git_repository}.git`);
                })
                .then(function (remote) {
                    return remote.push(['refs/heads/master:refs/heads/master'],
                                       {
                                           callbacks: {
                                               credentials: function(url, user) {
                                                   return git.Cred.sshKeyFromAgent(user);
                                               }
                                           }
                                       });
                });
            });

            it(`Push: (${options.gitAppURL})`, function() {
                return expect(provDevice.commit).to.have.length(40);
            });
        }
    }
}
