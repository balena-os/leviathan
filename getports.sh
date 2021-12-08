#!/bin/bash

set -e

min="${1:-5000}"
max="${2:-6000}"
count="${3:-8}"

ports=()
while [ "${#ports[@]}" -lt "${count}" ]
do
    port="$(shuf -i "${min}-${max}" -n 1)"
    ss -lpn | grep -q ":${port} " || ports+=("${port}")
done

echo "${ports[@]}"
