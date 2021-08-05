#!/bin/bash

rm -R /data/suite
rm /data/os.img
rm /data/config.json

cp -R /tmp/tests/. /data

npm start
