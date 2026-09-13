"""PriceOracle – Dexscreener token-price API wrapper.

Fetches USD prices and basic market data for any token on any supported chain.
Cache-friendly, rate-limit aware, no API key required.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

import httpx

# ─── Config ──────────────────────────────────────────────────────────────────
CACHE_DIR = Path(os.getenv("HERMES_PRICE_CACHE", Path.home() / ".hermes" / "price_cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_TTL = int(os.getenv("HERMES_PRICE_TTL", "30"))
REQUEST_TIMEOUT = float(os.getenv("HERMES_PRICE_TIMEOUT", "10.0"))
MAX_RETRIES = int(os.getenv("HERMES_PRICE_RETRIES", "2"))
BACKOFF_FACTOR = float(os.getenv("HERMES_BACKOFF_FACTOR", "0.5"))

# Chain → Dexscreener chain ID
CHAIN_MAP = {
    "ethereum": "ethereum",  "bsc": "bsc",  "polygon": "polygon",
    "arbitrum": "arbitrum",  "optimism": "optimism",  "base": "base",
    "avalanche": "avalanche",  "fantom": "fantom",  "solana": "solana",
    "blast": "blast",  "zksync": "zksync",  "linea": "linea",
    "scroll": "scroll",  "mantle": "mantle",
}

# ─── Model ───────────────────────────────────────────────────────────────────
@dataclass
class TokenPrice:
    address: str
    chain: str
    price_usd: float | None = None
    fdv: float | None = None
    volume_h24: float | None = None
    price_change_h24: float | None = None
    updated_at: float = 0.0

    def as_dict(self) -> dict:
        d = asdict(self)
        d["updated_at"] = round(d["updated_at"], 2)
        return d

# ─── Cache ───────────────────────────────────────────────────────────────────
def _cache_file(address: str, chain: str) -> Path:
    h = hashlib.md5(f"{chain}:{address}".encode()).hexdigest()[:12]
    return CACHE_DIR / f"price_{h}.json"

def _read_cache(address: str, chain: str) -> TokenPrice | None:
    f = _cache_file(address, chain)
    try:
        if f.exists():
            data = json.loads(f.read_text())
            if time.time() - data.get("updated_at", 0) < CACHE_TTL:
                return TokenPrice(**data)
    except Exception:
        pass
    return None

def _write_cache(tp: TokenPrice) -> None:
    try:
        _cache_file(tp.address, tp.chain).write_text(json.dumps(asdict(tp)))
    except Exception:
        pass

# ─── Core fetch ──────────────────────────────────────────────────────────────
async def fetch_price(
    address: str,
    chain: str = "ethereum",
    *,
    client: httpx.AsyncClient | None = None,
) -> Optional[TokenPrice]:
    """
    Fetch price for a single token via Dexscreener /token-price/v1/{chain}.
    Returns None if token has no listed pair.
    """
    chain_id = CHAIN_MAP.get(chain.lower(), chain.lower())
    addr = address.lower()

    # Cache
    cached = _read_cache(addr, chain_id)
    if cached:
        return cached

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)

    url = f"https://api.dexscreener.com/token-price/v1/{chain_id}?addresses={addr}"
    try:
        resp = await client.get(url, headers={"Accept": "application/json"})
        if resp.status_code == 200:
            data = resp.json()
            pairs = data.get("prices", [])
            if not pairs:
                return None
            # Prefer pair with most liquidity
            best = max(pairs, key=lambda p: p.get("liquidity", {}).get("usd", 0) or 0, default=None)
            if not best or not best.get("priceUsd"):
                return None
            tp = TokenPrice(
                address=addr,
                chain=chain_id,
                price_usd=float(best["priceUsd"]),
                fdv=float(best.get("fdv", 0) or 0),
                volume_h24=float(best.get("volumeH24", 0) or 0),
                price_change_h24=float(best.get("priceChange", {}).get("h24", 0) or 0),
                updated_at=time.time(),
            )
            _write_cache(tp)
            return tp
        elif resp.status_code == 429:
            await asyncio.sleep(3)
        return None
    finally:
        if own_client:
            await client.aclose()

async def fetch_bulk(
    addresses: list[str],
    chain: str = "ethereum",
    *,
    client: httpx.AsyncClient | None = None,
    batch_size: int = 30,
) -> dict[str, TokenPrice]:
    """
    Bulk fetch up to batch_size addresses per request.
    """
    results: dict[str, TokenPrice] = {}
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)
    try:
        for i in range(0, len(addresses), batch_size):
            batch = [a.lower() for a in addresses[i:i+batch_size]]
            joined = ",".join(batch)
            url = f"https://api.dexscreener.com/token-price/v1/{chain}?addresses={joined}"
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    for p in data.get("prices", []):
                        addr = p.get("address", "").lower()
                        if addr and p.get("priceUsd"):
                            tp = TokenPrice(
                                address=addr,
                                chain=chain,
                                price_usd=float(p["priceUsd"]),
                                fdv=float(p.get("fdv", 0) or 0),
                                volume_h24=float(p.get("volumeH24", 0) or 0),
                                price_change_h24=float(p.get("priceChange", {}).get("h24", 0) or 0),
                                updated_at=time.time(),
                            )
                            results[addr] = tp
                            _write_cache(tp)
                elif resp.status_code == 429:
                    await asyncio.sleep(3)
            except Exception:
                pass
            await asyncio.sleep(0.3)
    finally:
        if own_client:
            await client.aclose()
    return results

# ─── Sync wrappers ────────────────────────────────────────────────────────────
def get_price_sync(address: str, chain: str = "ethereum") -> TokenPrice | None:
    try:
        return asyncio.run(fetch_price(address, chain))
    except RuntimeError:
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(fetch_price(address, chain))

def get_bulk_sync(addresses: list[str], chain: str = "ethereum") -> dict[str, TokenPrice]:
    try:
        return asyncio.run(fetch_bulk(addresses, chain))
    except RuntimeError:
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(fetch_bulk(addresses, chain))

__all__ = ["TokenPrice", "fetch_price", "fetch_bulk", "get_price_sync", "get_bulk_sync"]

# Backward compatibility: scanner expects `PriceOracle` class
# Previously inherited from a non-existent DexscreenerAPI. Now a standalone wrapper.
from .portfolio_registry import TokenSpec


class PriceOracle:
    """Compatibility wrapper — provides get_prices() used by LiquidityDaemon.

    Historically this accepted a cache file path; modern implementation uses
    the module-level CACHE_DIR. The argument is retained for compatibility.
    """

    def __init__(self, cache_path):
        self.cache_path = cache_path

    def get_prices(self, tokens: list[TokenSpec]) -> dict[str, float]:
        """Return a mapping from token symbol → USD price for the given tokens."""
        by_chain: dict[str, list[tuple[str, str]]] = {}
        for t in tokens:
            by_chain.setdefault(t.chain, []).append((t.address, t.symbol.upper()))
        prices: dict[str, float] = {}
        for chain, addr_sym_list in by_chain.items():
            addrs = [addr for addr, _ in addr_sym_list]
            results = get_bulk_sync(addrs, chain)
            for addr, symbol in addr_sym_list:
                tp = results.get(addr)
                if tp and tp.price_usd is not None:
                    prices[symbol] = tp.price_usd
        return prices
