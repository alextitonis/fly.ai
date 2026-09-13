"""
Triangular Arbitrage Scanner — detect 3-token cycles with net profit.

Algorithm:
  1. Build a directed price graph G where edge (A->B) exists if we have a quote
     buying B with A. Store weight = amount_out per unit amount_in.
  2. Enumerate all 3-cycles A→B→C→A (simple nested loops over token set).
  3. For each cycle, compute product P = w(A→B) * w(B→C) * w(C→A).
     If P > 1 (accounting for fees), gross profit exists.
  4. Convert to ETH profit using token price estimates (via price oracle or WETH quotes).
  5. Subtract gas (3 swaps + 3 approvals) → net profit.
  6. Report if net > threshold.

Design constraints:
  • Tokens must have WETH and/or USDC pairs to estimate USD/ETH value
  • Quotes come from direct RPC (V2/V3) or KyberSwap — already available in daemon
  • Runs on a slower cadence than pairwise (e.g., once per 10 polls) to save RPC
  • Outputs ArbitrageOpportunity compatible objects for DB + executor

Usage: call TriangularScanner.scan(chain, quote_cache) from daemon.
"""

import itertools
import logging
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Minimal token whitelist — must have both WETH and USDC pairs to value profit
# In production this is derived from top100.json or config
CORE_TOKENS = {
    "base": [
        "0x4200000000000000000000000000000000000006",  # WETH
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",  # USDC
        "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",  # USDbC
    ],
    "ethereum": [
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  # WETH
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",  # USDC
    ],
    "arbitrum": [
        "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",  # WETH
        "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  # USDC
    ],
}

@dataclass
class Edge:
    token_out: str
    amount_out_raw: int        # for 1 unit of token_in (scaled to 18 decimals for in, out varies)
    dex_name: str
    fee_wei: int = 0

@dataclass
class TriangleOpportunity:
    chain: str
    token_a: str
    token_b: str
    token_c: str
    leg1: Edge
    leg2: Edge
    leg3: Edge
    product_raw: int           # numerator/denom product (scaled by 10^{48})
    gross_profit_eth: Decimal
    net_profit_eth: Decimal
    gas_cost_eth: Decimal
    timestamp: float


class TriangularScanner:
    """Detects 3-token cyclic arbitrage opportunities."""

    def __init__(self, chains: List[str], quote_amount_wei: int = 10**18):
        self.chains = chains
        self.quote_amount_wei = quote_amount_wei
        self._gas_estimate = 210000 + 3 * 180000   # transfer + 3 swaps ≈ 750k
        self._last_run = 0.0

    async def scan(self, chain: str, quote_cache: Dict[Tuple[str,str], List]) -> List[TriangleOpportunity]:
        """
        Run triangular scan on a chain using supplied quotes.

        Args:
          chain: chain name
          quote_cache: {(token_in, token_out): [PriceQuote, ...]} from latest poll

        Returns:
          List of TriangleOpportunity with net profit > 0
        """
        now = time.time()
        if now - self._last_run < 60:  # rate limit to every minute
            return []
        self._last_run = now

        # Build directed graph: token_in -> {token_out: best Edge}
        graph: Dict[str, Dict[str, Edge]] = {}
        tokens_seen: Set[str] = set()

        for (tin, tout), quotes in quote_cache.items():
            if not quotes:
                continue
            # Choose best (highest amount_out) quote
            best = max(quotes, key=lambda q: q.amount_out)
            if best.amount_out <= 0:
                continue
            if tin not in graph:
                graph[tin] = {}
            graph[tin][tout] = Edge(
                token_out=tout,
                amount_out_raw=best.amount_out,
                dex_name=best.dex_name,
                fee_wei=best.fee_wei,
            )
            tokens_seen.add(tin)
            tokens_seen.add(tout)

        tokens = list(tokens_seen)
        if len(tokens) < 3:
            return []

        opportunities = []
        core = set(CORE_TOKENS.get(chain, []))

        # Enumerate 3-cycles: A -> B -> C -> A
        # We enforce that at least one of A/B/C is in core tokens for ETH valuation
        for a, b, c in itertools.combinations(tokens, 3):
            for perm in [(a, b, c), (a, c, b)]:
                A, B, C = perm
                e1 = graph.get(A, {}).get(B)
                e2 = graph.get(B, {}).get(C)
                e3 = graph.get(C, {}).get(A)
                if not (e1 and e2 and e3):
                    continue

                # Raw product (scaled to 10^54 due to three 10^18 factors)
                # We compute in Decimal to avoid overflow
                product = (Decimal(e1.amount_out_raw) / Decimal(self.quote_amount_wei)) * \
                          (Decimal(e2.amount_out_raw) / Decimal(self.quote_amount_wei)) * \
                          (Decimal(e3.amount_out_raw) / Decimal(self.quote_amount_wei))

                if product <= 1:
                    continue  # no gross profit

                gross_factor = product - 1

                # Estimate ETH value: need at least one token priced in ETH
                eth_price_eth = self._estimate_token_value_eth(chain, A) or \
                                self._estimate_token_value_eth(chain, B) or \
                                self._estimate_token_value_eth(chain, C)
                if not eth_price_eth:
                    # Skip if we can't value — need WETH/USDC pair
                    continue

                # Convert gross_factor (unitless) to ETH using quote amount as base
                gross_eth = gross_factor * Decimal(self.quote_amount_wei) / Decimal(10**18) * Decimal(eth_price_eth)

                # Rough gas estimate in ETH (dynamic)
                from .gas_oracle import get_gas_price_wei, get_fallback_gas
                import asyncio
                # We are already in async context — just call
                gas_wei = get_gas_price_wei(chain) or get_fallback_gas(chain)
                gas_eth = Decimal(gas_wei * self._gas_estimate) / Decimal(10**18)

                net_eth = gross_eth - gas_eth

                if net_eth > 0:
                    opp = TriangleOpportunity(
                        chain=chain,
                        token_a=A, token_b=B, token_c=C,
                        leg1=e1, leg2=e2, leg3=e3,
                        product_raw=int(product * 10**18),
                        gross_profit_eth=gross_eth,
                        net_profit_eth=net_eth,
                        gas_cost_eth=gas_eth,
                        timestamp=time.time(),
                    )
                    opportunities.append(opp)
                    logger.info("[Tri Arb] %s cycle net=%.6f ETH", "/".join([A[:6],B[:6],C[:6]]), float(net_eth))

        return opportunities

    def _estimate_token_value_eth(self, chain: str, token: str) -> Optional[Decimal]:
        """
        Estimate token's value in ETH. Strategy:
          1. If token is WETH, return 1.
          2. If token is USDC/USDbC, fetch WETH/USDC spot via direct quote.
          3. If token has known WETH pair, quote it via RPC.
        Returns eth_per_token (e.g., USDC ≈ 0.0004 ETH).
        """
        weth_map = {
            "base": "0x4200000000000000000000000000000000000006",
            "ethereum": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            "arbitrum": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        }
        weth = weth_map.get(chain, "").lower()
        token_l = token.lower()

        if token_l == weth:
            return Decimal(1)

        # Try direct quote via on-chain: quote WETH→token to get tokens per WETH, then invert
        # But our quoting function expects token_in→token_out. For token→WETH we need both directions.
        # Simplification: if token is USDC, use approximate static price (update via price oracle)
        if token_l in ("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
                       "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
                       "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"):
            # Rough 1 USDC ≈ 0.00041 ETH — should be fetched live via price feed
            # For now use very rough fallback; executor will re-price
            return Decimal("0.00041")

        return None


# Standalone test function for debugging
async def _test_triangular():
    import os, sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    logging.basicConfig(level=logging.INFO)
    scanner = TriangularScanner(chains=["base"])
    # Fake quote cache
    cache = {
        ("0x4200000000000000000000000000000000000006", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"): [
            type('QQ', (), {'amount_out': 2500 * 10**6, 'dex_name':'uni', 'fee_wei':0})()
        ],
        ("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", "0x4200000000000000000000000000000000000006"): [
            type('QQ', (), {'amount_out': int(0.0004 * 10**18), 'dex_name':'uni', 'fee_wei':0})()
        ],
    }
    opps = await scanner.scan("base", cache)
    print(f"Found {len(opps)} triangle opportunities")

if __name__ == "__main__":
    import asyncio
    asyncio.run(_test_triangular())
