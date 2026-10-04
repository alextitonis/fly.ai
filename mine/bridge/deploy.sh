#!/usr/bin/env bash
# Deploy the mining bridges to fly.io (app flyai-bridge).
#
#   bash mine/bridge/deploy.sh
#
# First time only:
#   fly apps create flyai-bridge --org <your-org>
#   fly ips allocate-v6 --app flyai-bridge && fly ips allocate-v4 --shared --app flyai-bridge
#   fly secrets set -a flyai-bridge ADMIN_TOKEN=... YESPOWER_POOL=... YESPOWER_USER=... KASPA_POOL=... KASPA_USER=...
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/mine"
cp "$ROOT"/mine/package.json "$ROOT"/mine/package-lock.json "$STAGE/mine/"
cp "$ROOT"/mine/bridge/Dockerfile "$ROOT"/mine/bridge/fly.toml "$STAGE/"
cp -r "$ROOT"/mine/src "$ROOT"/mine/web "$STAGE/mine/"
mkdir -p "$STAGE/mine/examples" "$STAGE/mine/bridge"
cp -r "$ROOT"/mine/examples/yespower "$ROOT"/mine/examples/yespower-pool "$ROOT"/mine/examples/kaspa "$ROOT"/mine/examples/btc-pool "$STAGE/mine/examples/"
rm -rf "$STAGE"/mine/examples/yespower/target
cp "$ROOT"/mine/bridge/start.ts "$STAGE/mine/bridge/"

SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "deploying $SHA from $STAGE"
fly deploy "$STAGE" -c "$STAGE/fly.toml" --remote-only --ha=false --build-arg GIT_SHA="$SHA" "$@"
