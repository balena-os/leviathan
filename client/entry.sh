#!/usr/bin/env bash

mkdir -p ./reports

exec node build/bin/multi-client $@
