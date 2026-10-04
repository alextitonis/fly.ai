#!/usr/bin/env bash
# Deploy the always-on fly world to fly.io (app fly-world-sim).
#
#   bash world/server/deploy.sh
#
# Stages only world/src and world/server (a few hundred KB) and builds remotely.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/world"
cp -r "$ROOT/world/src" "$ROOT/world/server" "$STAGE/world/"
cp "$ROOT/world/server/Dockerfile" "$ROOT/world/server/fly.toml" "$STAGE/"

SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
git -C "$ROOT" diff --quiet HEAD -- world/src world/server 2>/dev/null || SHA="$SHA-dirty"
echo "deploying $SHA from $STAGE"
fly deploy "$STAGE" -c "$STAGE/fly.toml" --remote-only --ha=false --build-arg GIT_SHA="$SHA" "$@"
