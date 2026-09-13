"""Tests for hermes_screener.metrics."""

import os

os.environ.setdefault("HERMES_HOME", "/tmp/test_hermes")


def test_metrics_singleton_exists():
    """Metrics singleton is importable."""
    from hermes_screener.metrics import metrics

    assert metrics is not None
    assert hasattr(metrics, "pipeline_runs")
    assert hasattr(metrics, "tokens_enriched")
    assert hasattr(metrics, "api_calls")


def test_metrics_increment():
    """Counters can be incremented without error."""
    from hermes_screener.metrics import metrics

    metrics.pipeline_runs.inc()
    metrics.api_calls.labels(provider="dexscreener", status="ok").inc()
    metrics.tokens_discovered.set(42)


def test_metrics_histogram_observe():
    """Histograms can record observations."""
    from hermes_screener.metrics import metrics

    metrics.token_score.observe(85.5)
    metrics.enrich_layer_duration.labels(layer="dexscreener").observe(1.23)
    metrics.api_latency.labels(provider="dexscreener").observe(0.45)


def test_metrics_wallet_patterns():
    """Wallet pattern counters work with labels."""
    from hermes_screener.metrics import metrics

    metrics.wallet_patterns.labels(pattern="sniper").inc()
    metrics.wallet_patterns.labels(pattern="insider").inc(3)
    metrics.wallet_patterns.labels(pattern="copy_trader").inc()


def test_metrics_db_operations():
    """DB operation counters work with labels."""
    from hermes_screener.metrics import metrics

    metrics.db_queries.labels(db="central_contracts", operation="SELECT").inc()
    metrics.db_query_duration.labels(db="central_contracts").observe(0.005)


def test_start_metrics_server_skippable():
    """start_metrics_server respects METRICS_ENABLED=false."""
    from hermes_screener import config
    from hermes_screener.metrics import start_metrics_server

    original = config.settings.metrics_enabled
    config.settings.metrics_enabled = False

    try:
        start_metrics_server()  # Should not start, no error
    finally:
        config.settings.metrics_enabled = original
