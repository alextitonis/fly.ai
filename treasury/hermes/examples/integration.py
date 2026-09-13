"""
Integration example: How to migrate existing scripts to use hermes_screener modules.

This file demonstrates the BEFORE/AFTER pattern for replacing scattered
os.getenv() + manual logging + hardcoded paths with the centralized config,
structured JSON logging, and Prometheus metrics.

Actual migration is done per-script — this is the reference.
"""

# ═══════════════════════════════════════════════════════════════════════════════
# BEFORE (what token_enricher.py looks like today):
# ═══════════════════════════════════════════════════════════════════════════════
#
#   import os, sys, logging
#   from pathlib import Path
#   from dotenv import load_dotenv
#
#   load_dotenv(Path.home() / '.hermes' / '.env')
#
#   DB_PATH = Path.home() / '.hermes' / 'data' / 'central_contracts.db'
#   OUTPUT_PATH = Path.home() / '.hermes' / 'data' / 'token_screener' / 'top100.json'
#   LOG_FILE = Path.home() / '.hermes' / 'logs' / 'token_screener.log'
#
#   TOP_N = int(os.getenv('SCREENER_TOP_N', '100'))
#   MAX_ENRICH = int(os.getenv('SCREENER_MAX_ENRICH', '300'))
#   API_KEY = os.getenv('COINGECKO_API_KEY', '')
#
#   logging.basicConfig(
#       level=logging.INFO,
#       format='%(asctime)s [%(levelname)s] %(message)s',
#       handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler(sys.stdout)]
#   )
#   log = logging.getLogger('token_enricher')
#
#   # ... rest of script uses log.info("fetching %s", token) ...


# ═══════════════════════════════════════════════════════════════════════════════
# AFTER (what it should look like):
# ═══════════════════════════════════════════════════════════════════════════════

# Replace the top of token_enricher.py with:

# ── hermes_screener imports ───────────────────────────────────────────────────
from hermes_screener.config import settings
from hermes_screener.logging import get_logger, log_duration
from hermes_screener.metrics import metrics, start_metrics_server

# ── All config now from settings ─────────────────────────────────────────────
DB_PATH = settings.db_path
OUTPUT_PATH = settings.output_path
TOP_N = settings.top_n
MAX_ENRICH = settings.max_enrich
MIN_CHANNEL_COUNT = settings.min_channels

# API keys (empty string = layer skipped gracefully)
COINGECKO_KEY = settings.coingecko_api_key
ETHERSCAN_KEY = settings.etherscan_api_key

# Scoring weights
W_CHANNEL = settings.w_channel
W_FRESHNESS = settings.w_freshness
# ... etc

# ── Structured JSON logger (replaces plain logging) ──────────────────────────
log = get_logger("token_enricher")

# ── Prometheus metrics (start server once at script top) ─────────────────────
start_metrics_server()


# ═══════════════════════════════════════════════════════════════════════════════
# USAGE PATTERNS (replacing old logging calls):
# ═══════════════════════════════════════════════════════════════════════════════


def example_enrichment():
    """Shows how to use structured logging + metrics in enrichment layers."""

    # OLD: log.info("Enriching token %s", token_address)
    # NEW: structured with context fields (searchable in JSON logs)
    token_address = "So11111111111111111111111111111111111111112"
    log.info("enrichment_start", token=token_address, layer="dexscreener")

    # OLD: start = time.time(); ...; log.info("Done in %.2fs", time.time() - start)
    # NEW: automatic duration tracking with log_duration context manager
    with log_duration(log, "dexscreener_fetch", token=token_address):
        # ... fetch data ...
        pass

    # Record metrics
    metrics.enrich_layer_calls.labels(layer="dexscreener", status="ok").inc()
    metrics.enrich_layer_duration.labels(layer="dexscreener").observe(1.23)

    # OLD: log.error("GoPlus failed for %s: %s", token, str(e))
    # NEW: structured error with full context
    try:
        # ... goplus call ...
        metrics.enrich_layer_calls.labels(layer="goplus", status="ok").inc()
    except Exception as e:
        log.warning("layer_failed", layer="goplus", token=token_address, error=str(e))
        metrics.enrich_layer_calls.labels(layer="goplus", status="error").inc()

    # Score recording
    final_score = 87.5
    metrics.token_score.observe(final_score)
    metrics.tokens_scored_above_threshold.labels(threshold="80").set(12)
    log.info("token_scored", token=token_address, score=final_score)


# ═══════════════════════════════════════════════════════════════════════════════
# LOG OUTPUT COMPARISON:
# ═══════════════════════════════════════════════════════════════════════════════
#
# OLD (plain text):
#   2026-04-14 19:30:01 [INFO] Enriching token So111...
#   2026-04-14 19:30:02 [WARNING] GoPlus failed for So111...: timeout
#
# NEW (structured JSON):
#   {"event":"enrichment_start","token":"So111...","layer":"dexscreener","level":"info","timestamp":"2026-04-14T19:30:01Z","service":"hermes-token-screener","version":"9.0.0"}
#   {"event":"dexscreener_fetch","duration_ms":1234.5,"level":"info","timestamp":"2026-04-14T19:30:02Z","service":"hermes-token-screener"}
#   {"event":"layer_failed","layer":"goplus","token":"So111...","error":"timeout","level":"warning","timestamp":"2026-04-14T19:30:03Z","service":"hermes-token-screener"}
#
# Query with jq:
#   cat token_screener.json.log | jq -r 'select(.layer=="goplus" and .level=="warning")'
#   cat token_screener.json.log | jq -r 'select(.duration_ms > 5000)'
