#!/usr/bin/env python3
"""
DEX Arbitrage Scanner: discovers pools, quotes prices, and identifies profitable cross-DEX spreads.
Uses direct RPC eth_call -- no external API dependencies.
"""

import json
import logging
import ssl
import time
import urllib.request
from dataclasses import dataclass, field
from decimal import Decimal, getcontext
from itertools import combinations
from typing import Optional
from hermes_screener import tor_config  # noqa: F401

getcontext().prec = 28

logger = logging.getLogger(__name__)

# Minimum net profit threshold (configurable via scan_arbitrage)
DEFAULT_MIN_PROFIT_PCT: Decimal = Decimal("0.002")

# Gas estimate for two swaps
GAS_UNITS_TWO_SWAPS: int = 200_000

# RPC endpoints per chain
CHAIN_RPCS: dict = {
    "base": [
        "https://base.llamarpc.com",
        "https://base.drpc.org",
        "https://1rpc.io/base",
    ],
    "ethereum": ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth"],
    "arbitrum": ["https://arb1.arbitrum.io/rpc", "https://rpc.ankr.com/arbitrum"],
}

# V2/V3 factories on Base (from base_dex_prices.py)
BASE_FACTORIES: dict = {
    "Uniswap V2": {
        "type": "v2",
        "factory": "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
        "router": "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    },
    "Aerodrome": {
        "type": "v2",
        "factory": "0x420DD381b31aEf6683db6B902084cB0FFECe40Da",
        "router": "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    },
    "BaseSwap V2": {
        "type": "v2",
        "factory": "0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB",
        "router": "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
    },
    "SushiSwap V2": {
        "type": "v2",
        "factory": "0x71524B4f93c58fcbF659783fCBe56AcF49992dDa",
        "router": "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891",
    },
    "Uniswap V3": {
        "type": "v3",
        "factory": "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
        "fees": [100, 500, 3000, 10000],
    },
    "PancakeSwap V3": {
        "type": "v3",
        "factory": "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
        "fees": [100, 500, 2500, 10000],
    },
}

# Known token decimals for Base chain
BASE_TOKEN_DECIMALS: dict = {
    "0x4200000000000000000000000000000000000006": 18,  # WETH
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 6,  # USDC
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": 6,  # USDT
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 18,  # DAI
    "0x940181a94a35a4569d4521129dfd34b47d5ed16c": 18,  # AERO
}

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

_rpc_indices: dict = {}


def _rpc_call(chain: str, method: str, params: list = None) -> dict:
    """Low-level JSON-RPC call with failover across chain RPCs."""
    if params is None:
        params = []
    rpcs = CHAIN_RPCS.get(chain, [])
    if not rpcs:
        return {"error": f"no RPCs for chain {chain}"}
    idx = _rpc_indices.get(chain, 0)
    for _ in range(len(rpcs) * 2):
        url = rpcs[idx % len(rpcs)]
        try:
            payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as resp:
                return json.loads(resp.read().decode())
        except Exception:
            idx += 1
            time.sleep(0.5)
    _rpc_indices[chain] = idx
    return {"error": "rpc_failed"}


def _eth_call(chain: str, to: str, data: str) -> str | None:
    """eth_call returning hex result or None."""
    r = _rpc_call(chain, "eth_call", [{"to": to, "data": data}, "latest"])
    result = r.get("result", "")
    return result if result and result != "0x" else None


def _get_token_decimals(token: str, chain: str) -> int:
    """Return token decimals, checking cache first then on-chain."""
    key = token.lower()
    if key in BASE_TOKEN_DECIMALS:
        return BASE_TOKEN_DECIMALS[key]
    # Call decimals() on-chain: selector 0x313ce567
    result = _eth_call(chain, token, "0x313ce567")
    if result and len(result) >= 66:
        try:
            dec = int(result, 16)
            if 0 < dec <= 36:
                BASE_TOKEN_DECIMALS[key] = dec
                return dec
        except ValueError:
            pass
    return 18  # fallback


def _check_v2_pool(factory: str, token_a: str, token_b: str, chain: str) -> str | None:
    """Return V2 pool address or None."""
    data = "0xe6a43905" + token_a[2:].zfill(64) + token_b[2:].zfill(64)
    result = _eth_call(chain, factory, data)
    if result and len(result) >= 66:
        addr = "0x" + result[-40:]
        return addr if addr != "0x" + "0" * 40 else None
    return None


def _check_v3_pool(factory: str, token_a: str, token_b: str, fee: int, chain: str) -> str | None:
    """Return V3 pool address or None."""
    data = "0x1698ee82" + token_a[2:].zfill(64) + token_b[2:].zfill(64) + hex(fee)[2:].zfill(64)
    result = _eth_call(chain, factory, data)
    if result and len(result) >= 66:
        addr = "0x" + result[-40:]
        return addr if addr != "0x" + "0" * 40 else None
    return None


def _quote_v2(router: str, token_a: str, token_b: str, amount_wei: int, chain: str) -> int | None:
    """getAmountsOut quote from V2 router."""
    path_off = "0" * 62 + "40"
    path_len = "0" * 62 + "02"
    data = (
        "0xd06ca61f"
        + hex(amount_wei)[2:].zfill(64)
        + path_off
        + path_len
        + token_a[2:].zfill(64)
        + token_b[2:].zfill(64)
    )
    result = _eth_call(chain, router, data)
    if result and len(result) >= 258:
        try:
            arr_len = int(result[66:130], 16)
            if arr_len >= 2:
                return int(result[194:258], 16)
        except ValueError:
            pass
    return None


def _quote_v3_slot0(pool: str, dec_in: int, dec_out: int, chain: str) -> float | None:
    """Spot price from V3 slot0 sqrtPriceX96."""
    result = _eth_call(chain, pool, "0x3850c7bd")
    if result and len(result) >= 66:
        try:
            sqrt = int(result[:66], 16)
            if sqrt > 0:
                price = (sqrt / (2**96)) ** 2 * (10 ** (dec_in - dec_out))
                return price
        except ValueError:
            pass
    return None


@dataclass
class PoolQuote:
    """Price quote from a single liquidity pool."""

    dex: str
    pool_address: str
    token_in: str
    token_out: str
    price: Decimal  # units of token_out per token_in
    fee_bps: int  # fee in basis points
    pool_type: str  # "v2" or "v3"
    chain: str
    router: str = ""  # router address for execution


@dataclass
class ArbOpportunity:
    """Identified cross-pool arbitrage opportunity."""

    buy_pool: PoolQuote
    sell_pool: PoolQuote
    gross_spread_pct: Decimal
    estimated_gas_usd: Decimal
    estimated_slippage_pct: Decimal
    net_profit_pct: Decimal
    is_profitable: bool
    trade_amount_usd: Decimal = Decimal("0")


def fetch_all_pool_quotes(
    token_address: str,
    base_token: str,
    chain: str,
    amount: Decimal,
) -> list[PoolQuote]:
    """
    Query every known DEX factory for pools containing token_address/base_token pair.
    Returns price quotes from each discovered pool via direct RPC.
    """
    quotes: list[PoolQuote] = []
    tA = token_address.lower()
    tB = base_token.lower()

    factories = BASE_FACTORIES if chain == "base" else {}
    if not factories:
        logger.warning(f"No factory config for chain {chain}")
        return quotes

    dec_in = _get_token_decimals(tA, chain)
    dec_out = _get_token_decimals(tB, chain)
    amount_wei = int(amount * Decimal(10**dec_in))

    for dex_name, cfg in factories.items():
        ftype = cfg["type"]
        factory_addr = cfg["factory"]

        try:
            if ftype == "v2":
                pool = _check_v2_pool(factory_addr, tA, tB, chain)
                if not pool:
                    pool = _check_v2_pool(factory_addr, tB, tA, chain)
                    if pool:
                        # swap direction
                        tA_eff, tB_eff = tB, tA
                    else:
                        continue
                else:
                    tA_eff, tB_eff = tA, tB

                router = cfg.get("router", "")
                out_wei = _quote_v2(router, tA_eff, tB_eff, amount_wei, chain)
                if out_wei and out_wei > 0:
                    out_dec = Decimal(out_wei) / Decimal(10**dec_out)
                    price = out_dec / amount
                    quotes.append(
                        PoolQuote(
                            dex=dex_name,
                            pool_address=pool,
                            token_in=tA,
                            token_out=tB,
                            price=price,
                            fee_bps=30,  # standard V2 fee
                            pool_type="v2",
                            chain=chain,
                            router=router,
                        )
                    )
                    logger.debug(f"V2 {dex_name}: price={price:.6f}")

            elif ftype == "v3":
                for fee in cfg.get("fees", [500, 3000]):
                    pool = _check_v3_pool(factory_addr, tA, tB, fee, chain)
                    if not pool:
                        pool = _check_v3_pool(factory_addr, tB, tA, fee, chain)
                        if pool:
                            spot = _quote_v3_slot0(pool, dec_out, dec_in, chain)
                            if spot and spot > 0:
                                price = Decimal(str(spot))
                            else:
                                continue
                        else:
                            continue
                    else:
                        spot = _quote_v3_slot0(pool, dec_in, dec_out, chain)
                        if spot and spot > 0:
                            price = Decimal(str(spot))
                        else:
                            continue

                    quotes.append(
                        PoolQuote(
                            dex=dex_name,
                            pool_address=pool,
                            token_in=tA,
                            token_out=tB,
                            price=price,
                            fee_bps=fee // 100,  # convert from 1/1M to bps
                            pool_type="v3",
                            chain=chain,
                            router="",
                        )
                    )
                    logger.debug(f"V3 {dex_name} fee={fee}: price={price:.6f}")

            time.sleep(0.1)

        except Exception as e:
            logger.warning(f"Error quoting {dex_name}: {e}")
            continue

    return quotes


def evaluate_opportunity(
    buy: PoolQuote,
    sell: PoolQuote,
    gas_price_gwei: float,
    trade_amount_usd: float,
    eth_price_usd: float = 3000.0,
    min_profit_pct: Decimal = DEFAULT_MIN_PROFIT_PCT,
) -> ArbOpportunity:
    """
    Evaluate profitability of buying on buy_pool and selling on sell_pool.
    All cost arithmetic uses Decimal for precision.
    """
    gwei = Decimal(str(gas_price_gwei))
    eth_price = Decimal(str(eth_price_usd))
    trade_usd = Decimal(str(trade_amount_usd))

    gross_spread = (sell.price - buy.price) / buy.price

    # Slippage per leg: 0.5% for V2, fee_bps/10000 for V3
    def leg_slippage(pool: PoolQuote) -> Decimal:
        if pool.pool_type == "v2":
            return Decimal("0.005")
        return Decimal(pool.fee_bps) / Decimal("10000")

    total_slippage = leg_slippage(buy) + leg_slippage(sell)

    # Gas cost: GAS_UNITS * gas_price_gwei * 1e-9 ETH * eth_price_usd / trade_usd
    gas_eth = Decimal(GAS_UNITS_TWO_SWAPS) * gwei * Decimal("1e-9")
    gas_usd = gas_eth * eth_price
    gas_cost_pct = gas_usd / trade_usd if trade_usd > 0 else Decimal("999")

    net_profit = gross_spread - total_slippage - gas_cost_pct
    profitable = net_profit > min_profit_pct

    return ArbOpportunity(
        buy_pool=buy,
        sell_pool=sell,
        gross_spread_pct=gross_spread,
        estimated_gas_usd=gas_usd,
        estimated_slippage_pct=total_slippage,
        net_profit_pct=net_profit,
        is_profitable=profitable,
        trade_amount_usd=trade_usd,
    )


def scan_arbitrage(
    token_address: str,
    base_token: str,
    chain: str,
    trade_amount_usd: float,
    gas_price_gwei: float = 1.0,
    eth_price_usd: float = 3000.0,
    min_profit_pct: float = 0.002,
    amount: Decimal = Decimal("0.01"),
) -> list[ArbOpportunity]:
    """
    Scan all known pools for token_address/base_token, return profitable arb opportunities
    sorted by net_profit_pct descending.
    """
    quotes = fetch_all_pool_quotes(token_address, base_token, chain, amount)
    if len(quotes) < 2:
        logger.info(f"Only {len(quotes)} quotes found, need at least 2 for arbitrage")
        return []

    min_pct = Decimal(str(min_profit_pct))
    opportunities: list[ArbOpportunity] = []

    for q1, q2 in combinations(quotes, 2):
        # Try both directions
        for buy, sell in [(q1, q2), (q2, q1)]:
            if sell.price <= buy.price:
                continue
            opp = evaluate_opportunity(
                buy,
                sell,
                gas_price_gwei=gas_price_gwei,
                trade_amount_usd=trade_amount_usd,
                eth_price_usd=eth_price_usd,
                min_profit_pct=min_pct,
            )
            if opp.is_profitable:
                opportunities.append(opp)

    opportunities.sort(key=lambda o: o.net_profit_pct, reverse=True)
    return opportunities
