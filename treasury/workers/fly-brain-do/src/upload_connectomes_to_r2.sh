#!/bin/bash
# Upload all 16 connectome artifacts to R2 bucket shit-token-weights
# Usage: bash upload_connectomes_to_r2.sh

set -e

DATA="/home/terex/fly-data/connectomes"
BUCKET="shit-token-weights"

CONNECTOMES=(
  "celegans" "drosophila" "human" "macaque" "macaque_modha" "mouse" "rat"
  "malecns" "hemibrain" "medulla" "mouse_retina" "platynereis"
  "ciona" "larva" "celegans_herm" "celegans_male"
)

echo "Uploading 16 connectome artifacts to R2 bucket: $BUCKET"
echo "=================================================="

for cid in "${CONNECTOMES[@]}"; do
  wpath="$DATA/$cid/weights.npz"
  mpath="$DATA/$cid/brain.npz"

  if [ ! -f "$wpath" ] || [ ! -f "$mpath" ]; then
    echo "  SKIP $cid (missing files)"
    continue
  fi

  # malecns uses legacy keys (weights.npz, brain.npz at root)
  # all others use <cid>/weights.npz, <cid>/brain.npz
  if [ "$cid" = "malecns" ]; then
    wkey="weights.npz"
    mkey="brain.npz"
  else
    wkey="$cid/weights.npz"
    mkey="$cid/brain.npz"
  fi

  echo "  Uploading $cid: $wkey, $mkey"
  npx wrangler r2 object put "$BUCKET/$wkey" --file="$wpath" --remote 2>&1 | grep -E "uploaded|error|Creating" || true
  npx wrangler r2 object put "$BUCKET/$mkey" --file="$mpath" --remote 2>&1 | grep -E "uploaded|error|Creating" || true
done

echo ""
echo "Upload complete. Listing R2 objects:"
npx wrangler r2 object list "$BUCKET" --remote 2>&1 | tail -40
