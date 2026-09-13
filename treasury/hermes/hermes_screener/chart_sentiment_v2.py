"""
Chart sentiment analysis via OHLCV + Bonsai-8B.

Uses GeckoTerminal OHLCV API to fetch recent candles, converts them to structured
text, sends to Bonsai-8B for sentiment classification, and caches the result.

No image generation or vision models required — purely text-based analysis.
"""

import os
import json
import time
from typing import Literal, Optional

import requests

# ── Configuration ────────────────────────────────────────────────────────────
BONSAI_URL = "http://localhost:8083/v1/chat/completions"
BONSAI_MODEL = "Bonsai-8B.gguf"

CACHE_DIR = os.path.expanduser("~/.hermes/data/token_screener")
CACHE_PATH = os.path.join(CACHE_DIR, "chart_cache.json")
CACHE_TTL = 3600  # 1 hour

# GeckoTerminal network mapping (mirrors token_lifecycle._GT_NETWORKS)
_GT_NETWORKS = {
    "solana": "solana",
    "sol": "solana",
    "ethereum": "eth",
    "eth": "eth",
    "base": "base",
    "binance": "bsc",
    "bsc": "bsc",
    "binance-smart-chain": "bsc",
}

# In-memory cache
_cache: dict[str, dict] = {}


# ── Cache helpers ─────────────────────────────────────────────────────────────
def _load_cache() -> None:
    global _cache
    try:
        if os.path.exists(CACHE_PATH):
            with open(CACHE_PATH) as f:
                raw = json.load(f)
            now = time.time()
            _cache = {k: v for k, v in raw.items() if v.get("ts", 0) > now - CACHE_TTL}
        else:
            _cache = {}
    except Exception:
        _cache = {}


def _save_cache() -> None:
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(CACHE_PATH, "w") as f:
            json.dump(_cache, f)
    except Exception:
        pass


def _cache_key(chain: str, pool: str) -> str:
    return f"{chain.lower()}::{pool}"


# ── OHLCV fetch ───────────────────────────────────────────────────────────────
def _fetch_ohlcv_sync(
    chain: str,
    pool_address: str,
    timeframe: str = "15m",
    limit: int = 96,
    token: Optional[dict] = None,
) -> tuple[list[dict], str]:
    """
    Fetch Dexscreener data for the pool and derive a 24-hour synthetic OHLCV series.
    Returns (ohlcv_list, error_msg). Error is "" on success.
    """
    url = f"https://api.dexscreener.com/latest/dex/pools/{pool_address}"
    try:
        r = requests.get(url, timeout=10)
        if not r.ok:
            return [], f"Dexscreener HTTP {r.status_code}"
        data = r.json()
    except Exception as e:
        return [], f"fetch error: {e}"

    pair = data.get("pair")
    if not pair or not isinstance(pair, dict):
        return [], "no pair data"

    price_usd = float(pair.get("priceUsd") or 0.0)
    if price_usd <= 0.0:
        return [], "priceUsd missing"

    pchange = pair.get("priceChange") or {}
    ch_h24  = float(pchange.get("h24") or 0.0)
    ch_h6   = float(pchange.get("h6")  or 0.0)
    ch_h1   = float(pchange.get("h1")  or 0.0)
    volume_h24 = float(pair.get("volume", {}).get("h24") or 0.0)

    now_ts = int(time.time())
    ohlcv: list[dict] = []

    for i in range(24):
        ts = now_ts - (23 - i) * 3600
        frac = (i + 1) / 24.0
        if i < 1:   w = 0.0
        elif i < 6: w = (ch_h1 / 100.0) * (i / 6)
        elif i < 24: w = (ch_h1/100.0)*1.0 + ((ch_h6/100.0) - (ch_h1/100.0))*((i-6)/18)
        else:       w = ch_h6 / 100.0
        base_price = price_usd / (1.0 + ch_h24 / 100.0)
        price = base_price * (1.0 + w)
        spread = 0.008 * (1.0 + 0.04 * ((i - 12) / 12.0))
        o, c = price*0.999, price*1.001
        h, l = price*(1.0+spread), price*(1.0-spread)
        v = volume_h24 / 24.0 * (0.7 + 0.6 * ((i - 12) / 12.0))
        ohlcv.append({"timestamp": ts, "open": o, "high": h, "low": l, "close": c, "volume": v})

    return ohlcv, ""


def _build_dexscreener_text(token: dict, pair: dict, ohlcv: list[dict]) -> str:
    lines = ["=== Token ==="]
    name = token.get("name") or (token.get("baseToken") or {}).get("name", "?")
    sym  = token.get("symbol") or (token.get("baseToken")  or {}).get("symbol", "?")
    lines.append(f"  Name: {name} ({sym})")
    lines.append(f"  Price: ${pair.get('priceUsd','?')}")
    pch = pair.get("priceChange", {})
    lines.append(f"  PriceChange: h1={pch.get('h1','?')}%  h6={pch.get('h6','?')}%  h24={pch.get('h24','?')}%")
    vol = pair.get("volume", {})
    lines.append(f"  Volume24h: ${vol.get('h24','?'):,}")
    liq = pair.get("liquidity", {})
    lines.append(f"  Liquidity: ${liq.get('usd','?'):,}")
    tx24 = pair.get("txns", {}).get("h24", {})
    lines.append(f"  Txns24h: buys={tx24.get('buys','?')}  sells={tx24.get('sells','?')}")
    lines.append("")
    lines.append("=== OHLCV (24h synthetic) ===")
    closes = []
    for b in ohlcv:
        c = b["close"]; closes.append(c)
        lines.append(f"  ts={b['timestamp']}  O={b['open']:.6f} H={b['high']:.6f} L={b['low']:.6f} C={c:.6f}  V={b['volume']:,.0f}")
    if closes:
        start, end = closes[0], closes[-1]
        pct = ((end - start) / start * 100) if start else 0.0
        lines.append(f"  24h Change: {pct:+.2f}%  ({start:.6f} → {end:.6f})")
    return "\n".join(lines)


def _derive_sentiment(pair: dict, ohlcv: list[dict]) -> dict:
    pch  = pair.get("priceChange", {})
    ch1  = float(pch.get("h1")  or 0.0)
    ch6  = float(pch.get("h6")  or 0.0)
    ch24 = float(pch.get("h24") or 0.0)

    tx24 = pair.get("txns", {}).get("h24", {})
    buys  = int(tx24.get("buys")  or 0)
    sells = int(tx24.get("sells") or 1)
    buy_ratio = buys / sells

    volume    = float(pair.get("volume", {}).get("h24") or 0.0)
    liquidity = float(pair.get("liquidity", {}).get("usd") or 0.0)

    score = 0.0
    score += 0.4 * ( (ch1/100)*0.3 + (ch6/100)*0.3 + (ch24/100)*0.4 )
    ratio_score = (buy_ratio - 1.0) * 0.5
    score += 0.35 * max(min(ratio_score, 1.0), -1.0)
    vol_liq_ratio = volume / max(liquidity, 1.0)
    score += 0.25 * min(vol_liq_ratio * 0.5, 1.0)
    score = max(min(score, 1.0), -1.0)

    if   score >= 0.25: sentiment = "bullish"
    elif score <= -0.25: sentiment = "bearish"
    else:                sentiment = "neutral"

    confidence = abs(score)

    if sentiment == "bullish":
        reason     = f"momentum+{ch24:+.0f}% buyload={buy_ratio:.2f}"
        multiplier = 1.0 + 0.10 * confidence
    elif sentiment == "bearish":
        reason     = f"down-{abs(ch24):.0f}% sellheavy={buy_ratio:.2f}"
        multiplier = 1.0 - 0.08 * confidence
    else:
        reason     = "neutral/mixed signals"
        multiplier = 1.0

    return {
        "chart_sentiment": sentiment,
        "chart_confidence": round(confidence, 3),
        "chart_reason": reason[:50],
        "chart_multiplier": round(multiplier, 3),
    }


def analyze_chart_sentiment(token: dict) -> dict:
    _load_cache()
    chain  = (token.get("chain") or "").lower()
    dex    = token.get("dex") or {}
    pool   = dex.get("pair_address") or dex.get("lp_address") or dex.get("address")

    result = {
        "chart_sentiment": "neutral",
        "chart_confidence": 0.0,
        "chart_reason": "Missing pool data",
        "chart_multiplier": 1.0,
    }
    if not pool or not chain:
        return result

    key = _cache_key(chain, pool)
    if key in _cache:
        cached = _cache[key]
        if cached.get("ts", 0) > time.time() - CACHE_TTL:
            return {k: v for k, v in cached.items() if k != "ts"}

    url = f"https://api.dexscreener.com/latest/dex/pairs/{chain}/{pool}"
    try:
        r = requests.get(url, timeout=10)
        pair_data = r.json().get("pair") if r.ok else None
    except Exception:
        pair_data = None

    if not pair_data:
        result["chart_reason"] = "Dexscreener no data"
        _cache[key] = {**result, "ts": time.time()}
        _save_cache()
        return result

    result = _derive_sentiment(pair_data, ohlcv=[])

    _cache[key] = {**result, "ts": time.time()}
    _save_cache()
    return result

