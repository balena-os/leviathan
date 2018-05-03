#!/bin/bash

set -o pipefail

trap 'echo "Teardown..." ; node ./scripts/teardown.js' EXIT

export RESINOS_TESTS_RESULTS_PATH="$RESINOS_TESTS_TMPDIR/results"

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

output=$(mktemp)
# Main
npm start --silent | tee $output ; exit_code=$?

formatted=$(mktemp)
# Postprocess format
node ./scripts/format.js markDownFormat $output > $formatted
# Merge metrics with ava output
jq --arg file "$(cat $formatted)" '{body: $file} + .' "${RESINOS_TESTS_RESULTS_PATH}" \
  > $output && mv $output "${RESINOS_TESTS_RESULTS_PATH}"

# Publish results
node ./scripts/pensieve.js publish "${RESINOS_TESTS_RESULTS_PATH}"

exit $exit_code
