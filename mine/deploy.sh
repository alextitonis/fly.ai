#!/usr/bin/env bash
# Deploy the mining server to fly.io (app flyai-mine).
#
#   bash mine/deploy.sh
#
# First time only:
#   fly apps create flyai-mine --org <your-org>
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

mkdir -p "$STAGE/world/src/roulette" "$STAGE/world/src/slots" "$STAGE/world/src/race" "$STAGE/world/src/arena" "$STAGE/world/public" "$STAGE/mine"
cp "$ROOT"/world/src/connectome.ts "$ROOT"/world/src/rng.ts "$STAGE/world/src/"
cp "$ROOT"/world/src/roulette/game.ts "$ROOT"/world/src/roulette/readout.ts "$STAGE/world/src/roulette/"
cp "$ROOT"/world/src/slots/game.ts "$STAGE/world/src/slots/"
cp "$ROOT"/world/src/race/game.ts "$ROOT"/world/src/race/readout.ts "$STAGE/world/src/race/"
cp "$ROOT"/world/src/arena/game.ts "$ROOT"/world/src/arena/readout.ts "$ROOT"/world/src/arena/stats.ts "$ROOT"/world/src/arena/shop.ts "$STAGE/world/src/arena/"
cp -r "$ROOT"/world/public/connectome "$STAGE/world/public/"
cp "$ROOT"/mine/package.json "$ROOT"/mine/package-lock.json "$ROOT"/mine/Dockerfile "$ROOT"/mine/fly.toml "$STAGE/mine/"
cp -r "$ROOT"/mine/src "$ROOT"/mine/web "$STAGE/mine/"
# Flyverse Maker closed test (2026-11-20): its server code lives in the private flyverse/ folder (not in git);
# ship it when it's here, else an empty folder and the /api/fv routes stay off
mkdir -p "$STAGE/flyverse"
if [ -d "$ROOT/flyverse/server" ]; then
  mkdir -p "$STAGE/flyverse/src" "$STAGE/flyverse/public/models" "$STAGE/flyverse/data"
  cp -r "$ROOT"/flyverse/server "$STAGE/flyverse/"
  cp "$ROOT"/flyverse/src/spec.ts "$ROOT"/flyverse/src/assets.ts "$ROOT"/flyverse/src/textures.ts "$STAGE/flyverse/src/"
  # the engine's sim: the server replays runs before they go on a leaderboard
  mkdir -p "$STAGE/flyverse/src/engine" && cp "$ROOT"/flyverse/src/engine/sim.ts "$ROOT"/flyverse/src/engine/track.ts "$STAGE/flyverse/src/engine/"
  mkdir -p "$STAGE/flyverse/src/games" && cp "$ROOT"/flyverse/src/games/samples.ts "$STAGE/flyverse/src/games/"
  cp "$ROOT"/flyverse/public/models/catalog.json "$STAGE/flyverse/public/models/"
  [ -d "$ROOT/flyverse/data/textures" ] && cp -r "$ROOT"/flyverse/data/textures "$STAGE/flyverse/data/"
fi

SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
git -C "$ROOT" diff --quiet HEAD -- mine world/src/connectome.ts world/src/rng.ts world/src/roulette world/src/slots world/src/race world/src/arena 2>/dev/null \
  && [ -z "$(git -C "$ROOT" ls-files --others --exclude-standard mine world/src/slots world/src/race world/src/arena)" ] || SHA="$SHA-dirty"
echo "deploying $SHA from $STAGE"
# some shells only have flyctl, or don't have ~/.fly/bin on PATH (bash started from PowerShell)
FLY="$(command -v fly || command -v flyctl || ls "$HOME"/.fly/bin/flyctl* 2>/dev/null | head -1 || true)"
[ -n "$FLY" ] || { echo "flyctl not found (looked on PATH and in ~/.fly/bin)" >&2; exit 1; }
"$FLY" deploy "$STAGE" -c "$STAGE/mine/fly.toml" --remote-only --ha=false --build-arg GIT_SHA="$SHA" "$@"
