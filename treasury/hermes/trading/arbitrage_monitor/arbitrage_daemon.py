"""
Cross-DEX Arbitrage Monitor v1

Monitors for price discrepancies across DEXes on the same chain
using existing DEX aggregation APIs. No mempool/calldata parsing
needed — just real-time price surveillance.

Strategy:
  • For each target pair (WETH/USDC, etc.), quote prices on:
    - Uniswap V2/V3 (direct RPC calls via RPC provider)
    - KyberSwap (aggregator API)
    - SushiSwap (Graph or subgraph)
    - Others as configured

  • Calculate cross-DEX spread (fee-aware)
  • Alert via Telegram when profitable

Events come from:
  • DefiLlama confirmed contract registry (source of DEX truth)
  • Manual pair configuration / top100.json
"""

import asyncio
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
CHAINS_TO_MONITOR = os.getenv("ARBITRAGE_CHAINS", "base,ethereum,arbitrum").split(",")
MIN_PROFIT_ETH      = float(os.getenv("ARBITRAGE_MIN_PROFIT_ETH", "0.015"))
POLL_INTERVAL       = int(os.getenv("ARBITRAGE_POLL_INTERVAL", "30"))
QUOTE_AMOUNT_WEI    = int(float(os.getenv("ARBITRAGE_QUOTE_AMOUNT_ETH", "1.0")) * 10**18)
DB_PATH             = os.getenv("ARBITRAGE_DB_PATH", os.path.expanduser("~/.hermes/data/arbitrage_opportunities.db"))

# ── Lazy DexAggregatorTrader import with graceful fallback ─────────────────────
try:
    from hermes_screener.trading.dex_aggregator_trader import DexAggregatorTrader
    HAS_FULL_TRADER = True
except Exception as e:
    import logging
    logger = logging.getLogger(__name__)
    logger.warning("[CrossDexArb] DexAggregatorTrader unavailable: %s", e)
    HAS_FULL_TRADER = False

    class DexAggregatorTrader:  # minimal stub when unavailable
        def __init__(self):
            self._api = "https://aggregator-api.kyberswap.com"
        def kyberswap_quote(self, chain: str, token_in: str, token_out: str, amount: str):
            import requests
            cid = {"base":"base","ethereum":"ethereum","arbitrum":"arbitrum"}.get(chain, "base")
            url = f"{self._api}/{cid}/api/v1/routes"
            try:
                r = requests.get(url, params={"tokenIn":token_in,"tokenOut":token_out,"amountIn":amount}, timeout=10)
                return r.json() if r.status_code==200 else {}
            except Exception:
                return {}

# ── Direct RPC quoting (Uniswap V2/V3) ─────────────────────────────────────────
# ── Direct RPC quoting (Uniswap V2/V3) ─────────────────────────────────────────
try:
    from . import dex_quoter, gas_oracle
    from .gas_oracle import get_gas_price
    from .balance_checker import get_multi_chain_balances
    HAS_DIRECT_QUOTE = True
except Exception as e:
    logger.warning("[CrossDexArb] Direct quoter unavailable (%s) — KyberSwap-only mode", e)
    HAS_DIRECT_QUOTE = False

# ── Triangular scanner ─────────────────────────────────────────────────────────
try:
    from .triangular_scanner import TriangularScanner
    HAS_TRIANGULAR = True
except Exception as e:
    logger.debug("[CrossDexArb] Triangular scanner unavailable: %s", e)
    HAS_TRIANGULAR = False

# ── Database + executor ───────────────────────────────────────────────────────
import sqlite3

def _init_db():
    schema = open(os.path.join(os.path.dirname(__file__), "db_schema.sql")).read()
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(schema)
    conn.commit()
    conn.close()

