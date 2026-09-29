#!/usr/bin/env bash
# Deploy the mining server to fly.io (app flyai-mine, Treasure org).
#
#   bash mine/deploy.sh
#
# First time only:
#   fly apps create flyai-mine --org treasure-403
#   fly volumes create mine_data --app flyai-mine --region cdg --size 1 --yes
#   fly ips allocate-v6 --app flyai-mine && fly ips allocate-v4 --shared --app flyai-mine
#     (the first deploy's automatic IP allocation failed for this org: "org_slug is only supported with private_v6")
#
# The staged context is the server, the world engine files it imports (the connectome engine and Fly Roulette's,
# Fly Slots' and Fly Race's shared rules) and the connectome export (~58 MB).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/world/src/roulette" "$STAGE/world/src/slots" "$STAGE/world/src/race" "$STAGE/world/public" "$STAGE/mine"
cp "$ROOT"/world/src/connectome.ts "$ROOT"/world/src/rng.ts "$STAGE/world/src/"
cp "$ROOT"/world/src/roulette/game.ts "$ROOT"/world/src/roulette/readout.ts "$STAGE/world/src/roulette/"
cp "$ROOT"/world/src/slots/game.ts "$STAGE/world/src/slots/"
cp "$ROOT"/world/src/race/game.ts "$ROOT"/world/src/race/readout.ts "$STAGE/world/src/race/"
cp -r "$ROOT"/world/public/connectome "$STAGE/world/public/"
cp "$ROOT"/mine/package.json "$ROOT"/mine/package-lock.json "$ROOT"/mine/Dockerfile "$ROOT"/mine/fly.toml "$STAGE/mine/"
cp -r "$ROOT"/mine/src "$ROOT"/mine/web "$STAGE/mine/"

SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
git -C "$ROOT" diff --quiet HEAD -- mine world/src/connectome.ts world/src/rng.ts world/src/roulette world/src/slots world/src/race 2>/dev/null \
  && [ -z "$(git -C "$ROOT" ls-files --others --exclude-standard mine world/src/slots world/src/race)" ] || SHA="$SHA-dirty"
echo "deploying $SHA from $STAGE"
fly deploy "$STAGE" -c "$STAGE/mine/fly.toml" --remote-only --ha=false --build-arg GIT_SHA="$SHA" "$@"
