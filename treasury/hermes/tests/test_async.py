"""Tests for hermes_screener.async_enrichment."""

import asyncio
import os
import time

import httpx

os.environ.setdefault("HERMES_HOME", "/tmp/test_hermes")
for key in [
    "COINGECKO_API_KEY",
    "ETHERSCAN_API_KEY",
    "GMGN_API_KEY",
    "SURF_API_KEY",
    "DEFI_API_KEY",
    "ZERION_API_KEY",
]:
    os.environ.pop(key, None)


def test_imports():
    """Module imports cleanly."""
    from hermes_screener.async_enrichment import (
        run_async_enrichment,
        run_async_enrichment_sync,
    )

    assert callable(run_async_enrichment)
    assert callable(run_async_enrichment_sync)


def test_layer_result():
    """LayerResult dataclass works."""
    from hermes_screener.async_enrichment import LayerResult

    r = LayerResult("test", True, 5, 10, 1.23)
    assert r.name == "test"
    assert r.success is True
    assert r.enriched_count == 5
    assert r.total_count == 10
    assert r.elapsed == 1.23
    assert r.error is None


def test_make_client():
    """_make_client creates httpx.AsyncClient."""
    from hermes_screener.async_enrichment import _make_client

    client = _make_client(timeout=5.0)
    assert isinstance(client, httpx.AsyncClient)


def test_async_dexscreener_enricher_init():
    """AsyncDexscreenerEnricher initializes with semaphore."""
    from hermes_screener.async_enrichment import AsyncDexscreenerEnricher

    enricher = AsyncDexscreenerEnricher(concurrency=3)
    assert enricher.semaphore._value == 3


def test_async_http_enricher_init():
    """AsyncHttpEnricher initializes correctly."""
    from hermes_screener.async_enrichment import AsyncHttpEnricher

    enricher = AsyncHttpEnricher(
        name="Test",
        concurrency=2,
        delay=0.5,
        timeout=10.0,
    )
    assert enricher.name == "Test"
    assert enricher.semaphore._value == 2
    assert enricher.delay == 0.5


def test_derived_enrichment():
    """Derived enrichment computes liq/fdv ratio."""
    from hermes_screener.async_enrichment import _enrich_derived

    tokens = [
        {
            "contract_address": "0xabc",
            "dex": {"fdv": 1000000, "liquidity_usd": 50000},
        },
        {
            "contract_address": "0xdef",
            "dex": {"fdv": 5000000, "liquidity_usd": 500000},
        },
    ]

    async def run():
        count = await _enrich_derived(tokens)
        return count

    count = asyncio.run(run())
    assert count == 2
    assert tokens[0]["derived"]["liq_fdv_ratio"] == 0.05
    assert tokens[0]["derived"]["liq_risk"] == "moderate"
    assert tokens[1]["derived"]["liq_fdv_ratio"] == 0.1
    assert tokens[1]["derived"]["liq_risk"] == "healthy"


def test_derived_empty_tokens():
    """Derived enrichment handles empty list."""
    from hermes_screener.async_enrichment import _enrich_derived

    async def run():
        return await _enrich_derived([])

    count = asyncio.run(run())
    assert count == 0


def test_run_async_enrichment_empty_candidates():
    """run_async_enrichment returns empty for empty candidates."""
    from hermes_screener.async_enrichment import run_async_enrichment

    async def run():
        enriched, results = await run_async_enrichment([])
        return enriched, results

    enriched, results = asyncio.run(run())
    assert enriched == []
    assert len(results) == 1
    assert results[0].success is False


def test_cli_enricher_wrapper():
    """_run_cli_enricher wraps sync functions."""
    from hermes_screener.async_enrichment import _run_cli_enricher

    def mock_enricher(tokens):
        for t in tokens:
            t["mock"] = True
        return tokens, len(tokens)

    tokens = [{"contract_address": "0xabc"}]

    async def run():
        return await _run_cli_enricher("Mock", mock_enricher, tokens)

    result = asyncio.run(run())
    assert result.success is True
    assert result.enriched_count == 1
    assert result.name == "Mock"


def test_age_hours():
    """Dexscreener age_hours calculation."""
    from hermes_screener.async_enrichment import AsyncDexscreenerEnricher

    assert AsyncDexscreenerEnricher._age_hours(None) is None
    age = AsyncDexscreenerEnricher._age_hours(int(time.time() * 1000))
    assert age is not None
    assert age < 1  # just created
