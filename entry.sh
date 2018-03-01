#!/bin/bash

RESINOS_TESTS_API_URL='https://api.resin.io'
RESINOS_TESTS_DOWNLOAD_API_URL='https://api.resinstaging.io'

trap 'echo "Teardown..." ; node ./scripts/teardown.js teardown "${RESINOS_TESTS_API_URL}"' EXIT 

RESINOS_TESTS_APPLICATION_NAME=$(
  set -m
  node ./scripts/resolve.js APPLICATION_NAME "${RESINOS_TESTS_APPLICATION_NAME}" & wait $!
)
RESINOS_TESTS_RESINOS_VERSION=$(
  set -m 
  node ./scripts/resolve.js RESINOS_VERSION "${RESINOS_TESTS_DOWNLOAD_API_URL-$RESINOS_TESTS_API_URL}" "${RESINOS_TESTS_RESINOS_VERSION}" "${RESINOS_TESTS_DEVICE_TYPE}" & wait $!
)

echo "Running tests..."
npm start
