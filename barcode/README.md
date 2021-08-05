# Instructions

1. Clone the repo
2. Add tests + image into the `/barcode/tests` directory (image must be called `os.img`, and be gzipped, the test suite must be in a folder called `suite`)
3. Add this to a leviathan docker-compose:
```
barcode:
    privileged: true
    build:
      context: ./barcode
    network_mode: host
    volumes:
      - 'core-storage:/data'
      - 'reports-storage:/reports'
    labels:
      io.balena.features.dbus: '1'
      io.balena.features.balena-socket: '1'
```
4. Push a release to an app with testbots in
5. Look at the `barcode/index.js` file - for now, you can start a test by sshing into the testbot `barcode` container and creating a file called `/tmp/start`
6. You can add a payload (e.g barcode value) by using the `addPayload` function. In the test, this will then be accessible via `this.suite.options.payload`
7. Logs are retreivable from `/reports/worker.log` (shared volume)
8. Make sure that you have an env variable set for the testbots core service `LOCAL=local`
9. Make sure that you have an env variable set for the testbots `TESTBOT_DUT_TYPE` that has the device type slug of the DUT as its value