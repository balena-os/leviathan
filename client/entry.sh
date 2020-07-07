#!/usr/bin/env bash

mkdir -p ./reports

exec node bin/multi-client -c ../workspace/config $@
