"""
Prometheus metrics for the Hermes Token Screener pipeline.

Exposes metrics on a background HTTP server (default port 9090).
Scrape with: curl http://localhost:9090/metrics

Metrics cover:
  - Pipeline runs (count, duration, tokens processed)
  - Enrichment layers (per-layer success/failure counts, duration)
  - Scoring (score distribution, tokens above threshold)
  - Wallet tracking (wallets discovered, scored, enriched)
  - API calls (per-provider request count, errors, latency)
  - DB operations (query count, duration)

Usage:
    from hermes_screener.metrics import metrics, start_metrics_server

    start_metrics_server()          # call once at script start
    metrics.pipeline_runs.inc()     # increment counter
    metrics.enrich_layer_duration.labels(layer="dexscreener").observe(1.23)
"""

from __future__ import annotations

import threading

from prometheus_client import (
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    Info,
    start_http_server,
)

from hermes_screener.config import settings
from hermes_screener.logging import get_logger

log = get_logger("metrics")


# ── Registry (avoid conflicts with other prometheus_client usage) ─────────
REGISTRY = CollectorRegistry(auto_describe=True)


class Metrics:
    """All Prometheus metrics in one place. Import the singleton `metrics`."""

    # ── Pipeline ─────────────────────────────────────────────────────────
    pipeline_runs = Counter(
        "hermes_pipeline_runs_total",
        "Total enrichment pipeline executions",
        registry=REGISTRY,
    )
    pipeline_duration = Histogram(
        "hermes_pipeline_duration_seconds",
        "Pipeline execution time",
        buckets=[1, 5, 10, 30, 60, 120, 300],
        registry=REGISTRY,
    )
    tokens_discovered = Gauge(
        "hermes_tokens_discovered",
        "Tokens discovered in latest run",
        registry=REGISTRY,
    )
    tokens_enriched = Gauge(
        "hermes_tokens_enriched",
        "Tokens successfully enriched in latest run",
        registry=REGISTRY,
    )
    tokens_scored_above_threshold = Gauge(
        "hermes_tokens_scored_above_threshold",
        "Tokens scoring above threshold in latest run",
        ["threshold"],
        registry=REGISTRY,
    )
    last_run_timestamp = Gauge(
        "hermes_last_run_timestamp_seconds",
        "Unix timestamp of last pipeline run",
        registry=REGISTRY,
    )

    # ── Enrichment Layers ────────────────────────────────────────────────
    enrich_layer_calls = Counter(
        "hermes_enrich_layer_calls_total",
        "Per-layer enrichment calls",
        ["layer", "status"],  # status: ok, error, skip
        registry=REGISTRY,
    )
    enrich_layer_duration = Histogram(
        "hermes_enrich_layer_duration_seconds",
        "Per-layer enrichment duration",
        ["layer"],
        buckets=[0.1, 0.5, 1, 2, 5, 10, 30],
        registry=REGISTRY,
    )

    # ── Scoring ──────────────────────────────────────────────────────────
    token_score = Histogram(
        "hermes_token_score",
        "Distribution of final token scores",
        buckets=[10, 20, 30, 40, 50, 60, 70, 80, 85, 90, 95, 100],
        registry=REGISTRY,
    )
    score_components = Histogram(
        "hermes_score_component",
        "Individual score component values",
        ["component"],  # channel, freshness, volume, etc.
        buckets=[0, 5, 10, 15, 20, 25],
        registry=REGISTRY,
    )

    # ── Wallet Tracking ──────────────────────────────────────────────────
    wallets_discovered = Counter(
        "hermes_wallets_discovered_total",
        "Total unique wallets discovered",
        registry=REGISTRY,
    )
    wallets_scored = Counter(
        "hermes_wallets_scored_total",
        "Total wallets scored",
        registry=REGISTRY,
    )
    wallet_score = Histogram(
        "hermes_wallet_score",
        "Distribution of wallet scores",
        buckets=[10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        registry=REGISTRY,
    )
    wallet_patterns = Counter(
        "hermes_wallet_patterns_total",
        "Wallet pattern detections",
        ["pattern"],  # sniper, insider, copy_trader, etc.
        registry=REGISTRY,
    )

    # ── API Calls ────────────────────────────────────────────────────────
    api_calls = Counter(
        "hermes_api_calls_total",
        "External API calls",
        ["provider", "status"],  # status: ok, error, timeout, rate_limited
        registry=REGISTRY,
    )
    api_latency = Histogram(
        "hermes_api_latency_seconds",
        "API call latency by provider",
        ["provider"],
        buckets=[0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
        registry=REGISTRY,
    )

    # ── Database ─────────────────────────────────────────────────────────
    db_queries = Counter(
        "hermes_db_queries_total",
        "Database queries",
        ["db", "operation"],  # db: central_contracts, wallet_tracker
        registry=REGISTRY,
    )
    db_query_duration = Histogram(
        "hermes_db_query_duration_seconds",
        "Database query duration",
        ["db"],
        buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
        registry=REGISTRY,
    )

    # ── Telegram Scraper ─────────────────────────────────────────────────
    tg_dialogs_scanned = Counter(
        "hermes_tg_dialogs_scanned_total",
        "Telegram dialogs scanned",
        registry=REGISTRY,
    )
    tg_contracts_found = Counter(
        "hermes_tg_contracts_found_total",
        "Contract addresses found in Telegram",
        registry=REGISTRY,
    )

    # ── System Info ──────────────────────────────────────────────────────
    system_info = Info(
        "hermes_screener",
        "System metadata",
        registry=REGISTRY,
    )


# Singleton
metrics = Metrics()

# Thread-safe server state
_server_thread: threading.Thread | None = None
_server_started = False


def start_metrics_server(port: int | None = None) -> None:
    """Start Prometheus metrics HTTP server (idempotent, thread-safe)."""
    global _server_started, _server_thread

    if not settings.metrics_enabled:
        log.info(
            "metrics_disabled",
            msg="Prometheus exporter disabled via METRICS_ENABLED=false",
        )
        return

    if _server_started:
        log.debug("metrics_already_running", port=port or settings.metrics_port)
        return

    port = port or settings.metrics_port

    def _run():
        start_http_server(port, registry=REGISTRY)
        log.info(
            "metrics_server_started",
            port=port,
            endpoint=f"http://0.0.0.0:{port}/metrics",
        )

    _server_thread = threading.Thread(target=_run, daemon=True, name="prometheus-metrics")
    _server_thread.start()
    _server_started = True

    # Set system info
    metrics.system_info.info(
        {
            "version": "9.0.0",
            "hermes_home": str(settings.hermes_home),
            "log_level": settings.log_level,
        }
    )

    # Small delay to let server bind
    import time

    time.sleep(0.2)
    log.info("metrics_ready", port=port)
