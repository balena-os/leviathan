module.exports = {
  leviathan: {
    artifacts: '/tmp/artifacts',    // To store artifacts meant to be reported as results at the end of the suite
    downloads: '/data/downloads',   // To store/download assets needed for the suite (non-persistent) 
    reports: '/reports/',           // To store/download reports generated from the suite (non-persistent) 
    workdir: '/data',
    uploads: {
      image: '/data/os.img',
      config: '/data/config.json',
      suite: '/data/suite',
      kernelHeaders: '/data/kernel_modules_headers.tar.gz',
    }
  }
};
