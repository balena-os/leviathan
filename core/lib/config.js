module.exports = {
  leviathan: {
    artifacts: '/tmp/artifacts',    // To store artifacts meant to be reported as results at the end of the suite
    downloads: '/data/workspace/downloads',   // To store/download assets needed for the suite (non-persistent) 
    reports: '/reports/',           // To store/download reports generated from the suite (non-persistent) 
    workdir: '/data',
    uploads: {
      config:'/data/workspace/config.js',
      suite: '/data/suites'
    }
  }
};
