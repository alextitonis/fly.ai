#!/usr/bin/env bash
# Deploy the Flybook worker + API to fly.io.
#
#   bash flybook/worker/deploy.sh
#
# The brain comes from PyPI (flybrain, pinned in requirements.txt) and its data files are
# downloaded during the remote build, so the staged context is only the worker, the
# translator and flytalk.py (a few hundred KB).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/flybook/worker/model"
cp "$ROOT"/flytalk.py "$STAGE/"
cp "$ROOT"/flybook/worker/*.py "$ROOT"/flybook/worker/house.json "$ROOT"/flybook/worker/requirements.txt \
   "$ROOT"/flybook/worker/Dockerfile "$ROOT"/flybook/worker/fly.toml "$STAGE/flybook/worker/"
cp "$ROOT"/flybook/worker/model/translator.npz "$ROOT"/flybook/worker/model/vocab.json "$STAGE/flybook/worker/model/"
cp -r "$ROOT"/flybook/worker/fonts "$STAGE/flybook/worker/"
# the breeding worker runs here too (jobs.py "breed", 2026-10-07; was the flyai-breed app): its private code from disk
mkdir -p "$STAGE/flytrade/breed" "$STAGE/flytrade/nft"
cp "$ROOT"/flytrade/breed/worker.py "$ROOT"/flytrade/breed/requirements.txt "$STAGE/flytrade/breed/"
cp "$ROOT"/flytrade/nft/gen.py "$STAGE/flytrade/nft/"
cp -r "$ROOT"/flytrade/nft/poses "$STAGE/flytrade/nft/"

SHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
git -C "$ROOT" diff --quiet HEAD -- flybook flytalk.py 2>/dev/null || SHA="$SHA-dirty"
echo "deploying $SHA from $STAGE"
fly deploy "$STAGE" -c "$STAGE/flybook/worker/fly.toml" --remote-only --ha=false --build-arg GIT_SHA="$SHA" "$@"
