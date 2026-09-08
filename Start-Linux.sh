#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo 'Please install Node.js 22 or newer: https://nodejs.org/'
  exit 1
fi
exec node launch.mjs
