#!/bin/bash
# loxley · the whole desk in one command, against the mock chain in this folder. no wallet, no ether, no network.
# double-click this file, or drag it into Terminal and press enter.
cd "$(dirname "$0")/.." || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  loxley needs node 18 or newer. install the LTS from https://nodejs.org/en/download and run this again."
  echo
  read -r -p "  press enter to close "
  exit 1
fi
node bin/loxley.js tour "$@"
echo
read -r -p "  press enter to close "
