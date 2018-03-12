#!/bin/bash

trap 'echo "Teardown..." ; node ./scripts/teardown.js' EXIT 

export RESINOS_TESTS_APPLICATION_NAME=$(
  set -m
  node ./scripts/resolve.js APPLICATION_NAME "${RESINOS_TESTS_APPLICATION_NAME}" & wait $!
)
export RESINOS_TESTS_RESINOS_VERSION=$(
  set -m 
  node ./scripts/resolve.js RESINOS_VERSION "${RESINOS_TESTS_RESINOS_VERSION}" "${RESINOS_TESTS_DEVICE_TYPE}" & wait $!
)
export RESINOS_TESTS_RESINOS_VERSION_UPDATE=$(
  set -m 
  node ./scripts/resolve.js RESINOS_VERSION "${RESINOS_TESTS_RESINOS_VERSION_UPDATE-*}" "${RESINOS_TESTS_DEVICE_TYPE}" & wait $!
)
export RESINOS_TESTS_SSH_KEY_LABEL=${RESINOS_TESTS_APPLICATION_NAME}

npm start
