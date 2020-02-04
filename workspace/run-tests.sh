#!/usr/bin/env bash

img_name=leviathan

if [ -n "$REBUILD_CLIENT" ] || ! docker inspect $img_name >/dev/null 2>/dev/null; then
  ./build-client.sh || exit 1
fi

ws_mount=$(pwd):/usr/src/app/workspace:ro
suites_mount=$(pwd)/../suites:/usr/src/app/suites:ro

docker run --rm -v $ws_mount -v $suites_mount --name $img_name-suite --network=host $img_name -n
