"""
Chart sentiment analysis via OHLCV + Bonsai-8B.

Uses GeckoTerminal OHLCV API to fetch recent candles, converts them to structured
text, sends to Bonsai-8B for sentiment classification, and caches the result.

No image generation or vision models required — purely text-based analysis.
"""

import os
import json
import time

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
def _fetch_ohlcv_sync(chain: str, pool: str, timeframe: str = "15m", limit: int = 96) -> list[list]:
    """
    Fetch OHLCV candles from GeckoTerminal.

    Returns list of [timestamp, open, high, low, close, volume] rows (oldest → newest).
    """
    net = _GT_NETWORKS.get(chain.lower(), "solana")
    url = f"https://api.geckoterminal.com/api/v2/networks/{net}/pools/{pool}/ohlcv/{timeframe}"
    try:
        r = requests.get(url, params={"aggregate": "1", "limit": str(limit)}, timeout=15)
        if r.status_code == 200:
            return r.json().get("data", {}).get("attributes", {}).get("ohlcv_list", [])
    except Exception:
        pass
    return []


# ── Text summarization ─────────────────────────────────────────────────────────
def _build_ohlcv_text(ohlcv: list[list]) -> str:
    """Convert OHLCV candles into a structured text summary for Bonsai."""
    if not ohlcv:
        return "No OHLCV data available."

    lines = ["OHLCV (oldest → newest):"]
    for _ts, o, h, low, c, v in ohlcv:
        lines.append(f"  O:{float(o):.6f} H:{float(h):.6f} L:{float(low):.6f} C:{float(c):.6f} V:{float(v):.0f}")

    closes = [float(c) for _, _, _, _, c, _ in ohlcv]
    highs = [float(h) for _, _, h, _, _, _ in ohlcv]
    lows = [float(low) for _, _, _, l, _, _ in ohlcv]
    volumes = [float(v) for _, _, _, _, _, v in ohlcv]

    oldest = closes[0]
    newest = closes[-1]
    pct_change = ((newest - oldest) / oldest * 100) if oldest else 0.0
    max_high = max(highs)
    min_low = min(lows)
    total_vol = sum(volumes)

    lines.append("")
    lines.append("Summary metrics:")
    lines.append(f"  Start={oldest:.6f}, End={newest:.6f}, Change={pct_change:+.2f}%")
    lines.append(f"  High={max_high:.6f}, Low={min_low:.6f}, Range={(max_high-min_low)/oldest*100:.1f}% of start")
    lines.append(f"  Total volume={total_vol:,.0f}")
    return "\n".join(lines)


# ── Bonsai LLM call ────────────────────────────────────────────────────────────
def _call_bonsai(prompt: str) -> dict | None:
    """
    Call Bonsai-8B and return parsed JSON response.
    Returns None on any error.
    """
    try:
        resp = requests.post(
            BONSAI_URL,
            json={
                "model": BONSAI_MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a crypto chart analyst. Respond ONLY with a raw JSON object. "
                            "No markdown, no explanation, no code fences. Keys: "
                            "sentiment (bullish|bearish|neutral), "
                            "confidence (float 0-1), "
                            "reason (string ≤40 chars)."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 120,
                "temperature": 0.1,
            },
            timeout=45,
        )
        if resp.status_code == 200:
            content = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            # Strip accidental markdown
            content = content.strip("`").strip()
            try:
                return json.loads(content)
            except Exception:
                return None
    except Exception:
        pass
    return None


# ── Public API ─────────────────────────────────────────────────────────────────
def analyze_chart_sentiment(token: dict) -> dict:
    """
    Analyze a token's chart via OHLCV using Bonsai-8B.

    Argument token must contain:
      - token["chain"]: e.g. "solana", "base", "ethereum"
      - token["dex"]["pair_address"] or token["dex"]["lp_address"]

    Returns dict with:
      chart_sentiment   : "bullish" | "bearish" | "neutral"
      chart_confidence  : float 0.0 – 1.0
      chart_reason      : short explanation string
      chart_multiplier  : float multiplier for final score (1.0 ± up to 0.15)
    """
    chain = (token.get("chain") or "").lower()
    dex = token.get("dex") or {}
    pool_address = dex.get("pair_address") or dex.get("lp_address") or dex.get("address")

    # Default neutral result
    result = {
        "chart_sentiment": "neutral",
        "chart_confidence": 0.0,
        "chart_reason": "Missing pool data",
        "chart_multiplier": 1.0,
    }

    if not pool_address or not chain:
        return result

    key = _cache_key(chain, pool_address)
    if key in _cache:
        cached = _cache[key]
        if cached.get("ts", 0) > time.time() - CACHE_TTL:
            # Return cached entry without ts
            return {k: v for k, v in cached.items() if k != "ts"}

    # Fetch OHLCV — prefer 15m (96 candles = 24h), fallback to 1h
    ohlcv = _fetch_ohlcv_sync(chain, pool_address, "15m", 96)
    if not ohlcv:
        ohlcv = _fetch_ohlcv_sync(chain, pool_address, "1h", 48)

    if not ohlcv:
        result["chart_reason"] = "OHLCV fetch failed"
        _cache[key] = {**result, "ts": time.time()}
        _save_cache()
        return result

    ohlcv_text = _build_ohlcv_text(ohlcv[:96])

    prompt = (
        "Analyze this token's 24h price action from OHLCV data. "
        "Respond with ONLY a JSON object with these exact keys:\n"
        "  sentiment: 'bullish' | 'bearish' | 'neutral'\n"
        "  confidence: float 0.0–1.0\n"
        "  reason: string ≤40 chars\n\n"
        f"{ohlcv_text}\n\n"
        "JSON:"
    )

    parsed = _call_bonsai(prompt)
    if parsed is None:
        result["chart_reason"] = "Bonsai call failed"
        _cache[key] = {**result, "ts": time.time()}
        _save_cache()
        return result

    sentiment = str(parsed.get("sentiment", "neutral")).lower()
    try:
        confidence = float(parsed.get("confidence", 0.5))
        confidence = max(0.0, min(1.0, confidence))
    except Exception:
        confidence = 0.5
    reason = str(parsed.get("reason", ""))[:60]

    # Map to multiplier: bullish → >1, bearish → <1, neutral → 1.0
    if sentiment == "bullish":
        multiplier = 1.0 + 0.15 * confidence
    elif sentiment == "bearish":
        multiplier = 1.0 - 0.15 * confidence
    else:
        multiplier = 1.0

    result = {
        "chart_sentiment": sentiment,
        "chart_confidence": round(confidence, 3),
        "chart_reason": reason,
        "chart_multiplier": round(multiplier, 4),
    }

    _cache[key] = {**result, "ts": time.time()}
    _save_cache()
    return result


# Initialise cache on import
_load_cache()
