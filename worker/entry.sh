#!/bin/sh

eval $(ssh-agent)

node ./build/bin
