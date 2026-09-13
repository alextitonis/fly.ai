#!/usr/bin/env bash
# Export latest data into the repo for Railway deployment
# Run this before pushing to deploy fresh data

set -euo pipefail
cd "$(dirname "$0")"

echo "=== Exporting data for Railway deployment ==="

DATA_DIR="hermes_screener/data"
TOKEN_DIR="$DATA_DIR/token_screener"
mkdir -p "$TOKEN_DIR"

# Copy SQLite databases
cp -v ~/.hermes/data/central_contracts.db "$DATA_DIR/"
cp -v ~/.hermes/data/wallet_tracker.db "$DATA_DIR/"

# Copy token data
cp -v ~/.hermes/data/token_screener/top100.json "$TOKEN_DIR/"

# Optional: copy other data files if they exist
[ -f ~/.hermes/data/abi_cache.json ] && cp -v ~/.hermes/data/abi_cache.json "$DATA_DIR/" || true

echo ""
echo "=== Data exported. Ready for git push + Railway deploy ==="
echo "Total size:"
du -sh "$DATA_DIR"
