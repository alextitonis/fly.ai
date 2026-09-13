"""
Gas price oracle: fetches real-time gas prices from DefiLlama.
Caches results for 30 seconds to avoid rate limits.

API: https://defillama.com/api/v1/gas?chain=base
"""

import asyncio
import json
import logging
import os
import time
from typing import Dict, Optional

import aiohttp

logger = logging.getLogger(__name__)

# DefiLlama chain name mapping (our chains → DL names)
CHAIN_DL_MAP = {
    "base": "base",
    "ethereum": "ethereum",
    "arbitrum": "arbitrum",
    "polygon": "polygon",
}

# Cache: chain → (timestamp, gas_price_wei)
_cache: Dict[str, tuple[float, Optional[int]]] = {}
_CACHE_TTL = 30  # seconds

async def get_gas_price_wei(chain: str, force_refresh: bool = False) -> Optional[int]:
    """
    Fetch current gas price in wei via DefiLlama.
    Returns None on failure (caller should fallback to default).
    """
    now = time.time()
    if not force_refresh and chain in _cache:
        ts, price = _cache[chain]
        if now - ts < _CACHE_TTL:
            return price

    dl_chain = CHAIN_DL_MAP.get(chain, chain)
    url = f"https://api.llama.fi/v1/gas/{dl_chain}"

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.get(url) as resp:
                if resp.status != 200:
                    logger.debug("[GasOracle] DL %s HTTP %s", chain, resp.status)
                    return None
                data = await resp.json()
                # DL returns: {"gasPriceGwei": X, ...} or list with dict
                gwei = None
                if isinstance(data, dict):
                    gwei = data.get("gasPriceGwei") or data.get("standard")
                elif isinstance(data, list) and data:
                    gwei = data[0].get("gasPriceGwei") or data[0].get("standard")
                if gwei:
                    price_wei = int(float(gwei) * 1e9)
                    _cache[chain] = (now, price_wei)
                    logger.debug("[GasOracle] %s = %d wei (%.1f gwei)", chain, price_wei, gwei)
                    return price_wei
    except Exception as e:
        logger.debug("[GasOracle] fetch failed %s: %s", chain, e)

    return None


async def get_gas_price_gwei(chain: str) -> Optional[float]:
    """Convenience wrapper returning gwei float."""
    wei = await get_gas_price_wei(chain)
    return wei / 1e9 if wei else None


# Fallback static prices for chains without DL support or errors
FALLBACK_GAS_GWEI = {
    "base": 0.07,        # ~0.07 gwei typical on Base
    "ethereum": 15.0,
    "arbitrum": 0.1,
    "polygon": 50.0,
}


def get_fallback_gas(chain: str) -> int:
    """Static fallback gas price in wei."""
    gwei = FALLBACK_GAS_GWEI.get(chain, 15.0)
    return int(gwei * 1e9)
