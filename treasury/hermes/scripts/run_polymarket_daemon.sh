#!/usr/bin/env bash
set -euo pipefail

# Load optional runtime config
# Default expected path: /etc/default/hermes-polymarket-daemon
if [[ -n "${DAEMON_ENV_FILE:-}" && -f "${DAEMON_ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${DAEMON_ENV_FILE}"
elif [[ -f "/etc/default/hermes-polymarket-daemon" ]]; then
  # shellcheck disable=SC1091
  source "/etc/default/hermes-polymarket-daemon"
fi

PYTHON_BIN="${PYTHON_BIN:-python3}"
QUERY="${QUERY:-bitcoin}"
MODE="${MODE:-paper}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-60}"
MIN_EDGE="${MIN_EDGE:-0.01}"
STAKE_USDC="${STAKE_USDC:-20}"
MARKET_SOURCE="${MARKET_SOURCE:-gamma}"
QUOTE_SOURCE="${QUOTE_SOURCE:-clob}"
EXECUTOR="${EXECUTOR:-clob-v1}"
POLY_DATA_DIR="${POLY_DATA_DIR:-/root/workspace/polymarket-bot/poly_data}"
POLY_VOLUME_WEIGHT="${POLY_VOLUME_WEIGHT:-0}"
USE_SUBGRAPH_SIGNAL="${USE_SUBGRAPH_SIGNAL:-0}"
SUBGRAPH_ENDPOINT="${SUBGRAPH_ENDPOINT:-https://api.goldsky.com/api/public/project_cl6mb8i9h0003e201j6li0diw/subgraphs/orderbook-subgraph/0.0.1/gn}"
MAX_ITERATIONS="${MAX_ITERATIONS:-0}"
MAX_RUNTIME_MINUTES="${MAX_RUNTIME_MINUTES:-0}"
MAX_DAILY_LOSS_USD="${MAX_DAILY_LOSS_USD:-0}"
COOLDOWN_ON_ERROR_SECONDS="${COOLDOWN_ON_ERROR_SECONDS:-30}"
LOG_FILE="${LOG_FILE:-logs/polymarket_trades.csv}"

ARGS=(
  "scripts/polymarket_daemon.py"
  --query "$QUERY"
  --mode "$MODE"
  --daemon
  --interval-seconds "$INTERVAL_SECONDS"
  --min-edge "$MIN_EDGE"
  --stake-usdc "$STAKE_USDC"
  --market-source "$MARKET_SOURCE"
  --quote-source "$QUOTE_SOURCE"
  --executor "$EXECUTOR"
  --poly-data-dir "$POLY_DATA_DIR"
  --poly-volume-weight "$POLY_VOLUME_WEIGHT"
  --subgraph-endpoint "$SUBGRAPH_ENDPOINT"
  --max-iterations "$MAX_ITERATIONS"
  --max-runtime-minutes "$MAX_RUNTIME_MINUTES"
  --max-daily-loss-usd "$MAX_DAILY_LOSS_USD"
  --cooldown-on-error-seconds "$COOLDOWN_ON_ERROR_SECONDS"
  --log-file "$LOG_FILE"
)

if [[ "$USE_SUBGRAPH_SIGNAL" == "1" ]]; then
  ARGS+=(--use-subgraph-signal)
fi

exec "$PYTHON_BIN" "${ARGS[@]}"
