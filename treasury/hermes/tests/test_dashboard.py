"""Tests for hermes_screener.dashboard (including chart endpoints)."""

import json
import os

import pytest

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


@pytest.fixture
def client(tmp_path):
    from fastapi.testclient import TestClient

    os.environ["HERMES_HOME"] = str(tmp_path)
    (tmp_path / "data" / "token_screener").mkdir(parents=True)
    with open(tmp_path / "data" / "token_screener" / "top100.json", "w") as f:
        json.dump(
            {
                "generated_at_iso": "2026-04-14T12:00:00Z",
                "total_candidates": 50,
                "enriched": 32,
                "tokens": [
                    {
                        "contract_address": "TEST123",
                        "chain": "solana",
                        "symbol": "TEST",
                        "name": "Test",
                        "score": 85.5,
                        "channel_count": 5,
                        "mentions": 10,
                        "fdv": 1000000,
                        "volume_h24": 500000,
                        "volume_h1": 25000,
                        "age_hours": 12.5,
                        "price_change_h1": 5.2,
                        "price_change_h6": -2.1,
                        "gmgn_smart_wallets": 3,
                        "positives": ["social HOT"],
                        "negatives": [],
                        "dex_url": "https://dexscreener.com/solana/TEST123",
                        "pair_address": "PairABC123",
                    },
                ],
            },
            f,
        )

    from importlib import reload

    from hermes_screener import config

    reload(config)
    from hermes_screener.dashboard import app

    reload(app)
    return TestClient(app.app)


# ── Existing page tests ──


def test_index(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "Token Leaderboard" in r.text
    assert "TEST" in r.text


def test_api_top100(client):
    r = client.get("/api/top100")
    assert r.status_code == 200
    assert len(r.json()["tokens"]) == 1


def test_api_stats(client):
    r = client.get("/api/stats")
    assert r.status_code == 200
    assert r.json()["tokens_scored"] == 1


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_token_detail(client):
    r = client.get("/token/TEST123")
    assert r.status_code == 200
    assert "TEST" in r.text
    assert "Live Chart" in r.text


def test_token_not_found(client):
    r = client.get("/token/UNKNOWN")
    assert r.status_code == 200
    assert "Not Found" in r.text


def test_wallets_page(client):
    r = client.get("/wallets")
    assert r.status_code == 200
    assert "Smart Money" in r.text


# ── Chart tests ──


def test_chart_page(client):
    """Chart page renders with TradingView Lightweight Charts."""
    r = client.get("/token/TEST123/chart")
    assert r.status_code == 200
    html = r.text
    assert "TEST" in html
    assert "Chart" in html
    assert "lightweight-charts" in html
    assert "createChart" in html
    assert "Candlestick" in html
    assert "Line" in html
    assert "Area" in html
    assert "setTimeframe" in html
    assert "5m" in html
    assert "1H" in html
    assert "1D" in html


def test_chart_page_has_api_calls(client):
    """Chart page has JS that calls our chart API endpoints."""
    r = client.get("/token/TEST123/chart")
    html = r.text
    assert "/api/pool/" in html
    assert "/api/chart/" in html


def test_chart_page_has_links(client):
    """Chart page has links to Dexscreener and token detail."""
    r = client.get("/token/TEST123/chart")
    html = r.text
    assert "/token/TEST123" in html  # back link
    assert "Dexscreener" in html


def test_chart_not_found(client):
    """Chart page for unknown token shows error."""
    r = client.get("/token/UNKNOWN/chart")
    assert r.status_code == 200
    assert "not found" in r.text.lower()


def test_token_detail_has_chart_link(client):
    """Token detail page has link to chart."""
    r = client.get("/token/TEST123")
    assert "Live Chart" in r.text
    assert "/token/TEST123/chart" in r.text


def test_api_chart_endpoint_format(client):
    """Chart API endpoint accepts correct parameters."""
    # This will fail to fetch from GeckoTerminal but should return proper structure
    r = client.get("/api/chart/solana/FakePool123?timeframe=hour&aggregate=1&limit=50")
    assert r.status_code == 200
    data = r.json()
    assert "candles" in data
    assert "count" in data
    assert data["timeframe"] == "hour"
    assert data["aggregate"] == 1


def test_api_pool_endpoint_format(client):
    """Pool API endpoint returns proper structure."""
    r = client.get("/api/pool/solana/FakeAddr123")
    assert r.status_code == 200
    data = r.json()
    assert "pool_address" in data
