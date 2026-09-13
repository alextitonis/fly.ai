#!/usr/bin/env python3
"""
Solana On-Chain Price Fetcher v3
Fetches prices from 125+ Solana DEX pools across 11 token pairs.
For arbitrage: compares prices across all sources to find spreads.
"""

import base64
import requests
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import requests

SOLANA_RPC = "https://api.mainnet-beta.solana.com"

# ═══════════════════════════════════════════════════════════════
# TOKEN REGISTRY
# ═══════════════════════════════════════════════════════════════

TOKENS = {
    "SOL": {"mint": "So11111111111111111111111111111111111111112", "decimals": 9},
    "USDC": {"mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "decimals": 6},
    "USDT": {"mint": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "decimals": 6},
    "BONK": {"mint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "decimals": 5},
    "JUP": {"mint": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "decimals": 6},
    "RAY": {"mint": "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", "decimals": 6},
    "ORCA": {"mint": "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", "decimals": 6},
    "mSOL": {"mint": "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", "decimals": 9},
    "Pyth": {"mint": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", "decimals": 6},
    "wIF": {"mint": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", "decimals": 6},
}

SOL_MINT = TOKENS["SOL"]["mint"]
USDC_MINT = TOKENS["USDC"]["mint"]

TOKEN_PAIRS = [
    "SOL/USDC",
    "SOL/USDT",
    "SOL/BONK",
    "SOL/JUP",
    "SOL/RAY",
    "SOL/ORCA",
    "SOL/mSOL",
    "SOL/Pyth",
    "SOL/wIF",
    "USDC/USDT",
    "USDC/BONK",
]


@dataclass
class PriceQuote:
    dex: str
    pool: str
    price: float
    pair: str
    source: str
    tvl: float = 0.0
    volume_24h: float = 0.0
    timestamp: float = 0.0


class SolanaRPC:
    def __init__(self, url: str = SOLANA_RPC):
        self.url = url
        self.s = requests.Session()

    def get_account(self, addr: str) -> bytes | None:
        r = self.s.post(
            self.url,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getAccountInfo",
                "params": [addr, {"encoding": "base64"}],
            },
            timeout=10,
        )
        v = r.json().get("result", {}).get("value")
        if v and v.get("data"):
            return base64.b64decode(v["data"][0])
        return None


def base58(data: bytes) -> str:
    B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    num = int.from_bytes(data, "big")
    enc = ""
    while num > 0:
        num, r = divmod(num, 58)
        enc = B58[r] + enc
    for b in data:
        if b == 0:
            enc = "1" + enc
        else:
            break
    return enc


# ═══════════════════════════════════════════════════════════════
# ON-CHAIN READERS
# ═══════════════════════════════════════════════════════════════


def read_sqrt_price(data: bytes, dec_a: int, dec_b: int, offset_hint: int = 0) -> float | None:
    """Read sqrt_price_x64 from on-chain account and compute price."""
    if not data:
        return None
    dec_adj = 10 ** (dec_a - dec_b)

    if offset_hint > 0 and len(data) >= offset_hint + 16:
        sqrt = int.from_bytes(data[offset_hint : offset_hint + 16], "little")
        if sqrt > 0:
            raw = (sqrt / (2**64)) ** 2
            return raw * dec_adj

    for off in range(40, min(len(data) - 16, 350)):
        val = int.from_bytes(data[off : off + 16], "little")
        if val > 0:
            raw = (val / (2**64)) ** 2
            price = raw * dec_adj
            if price > 0.000001:
                return price
    return None


# ═══════════════════════════════════════════════════════════════
# API FETCHERS (multi-pair)
# ═══════════════════════════════════════════════════════════════


def fetch_raydium_api(pair_name: str) -> list[PriceQuote]:
    """Fetch all pools for a token pair from Raydium API."""
    results = []
    tokens = pair_name.split("/")
    mint_a = TOKENS.get(tokens[0], {}).get("mint", SOL_MINT)
    mint_b = TOKENS.get(tokens[1], {}).get("mint", USDC_MINT)
    try:
        resp = requests.get(
            "https://api-v3.raydium.io/pools/info/mint",
            params={
                "mint1": mint_a,
                "mint2": mint_b,
                "poolType": "all",
                "poolSortField": "liquidity",
                "sortType": "desc",
                "page": 1,
                "pageSize": 50,
            },
            timeout=15,
        )
        if resp.status_code == 200:
            for p in resp.json().get("data", {}).get("data", []):
                price = p.get("price", 0)
                tvl = p.get("tvl", 0) or 0
                if price > 0 and tvl > 100:
                    results.append(
                        PriceQuote(
                            dex=f'raydium_{p.get("type", "?").lower()}',
                            pool=p.get("id", ""),
                            price=price,
                            pair=pair_name,
                            source="api",
                            tvl=tvl,
                            volume_24h=p.get("day", {}).get("volume", 0) or 0,
                            timestamp=time.time(),
                        )
                    )
    except Exception:
        pass
    return results


def fetch_orca_api(pair_name: str) -> list[PriceQuote]:
    """Fetch all pools for a token pair from Orca (on-chain sqrt_price)."""
    results = []
    tokens = pair_name.split("/")
    mint_a = TOKENS.get(tokens[0], {}).get("mint", SOL_MINT)
    mint_b = TOKENS.get(tokens[1], {}).get("mint", USDC_MINT)
    dec_a = TOKENS.get(tokens[0], {}).get("decimals", 9)
    dec_b = TOKENS.get(tokens[1], {}).get("decimals", 6)
    rpc = SolanaRPC()
    try:
        resp = requests.get("https://api.orca.so/v1/whirlpool/list", timeout=15)
        pools = resp.json().get("whirlpools", [])
        for p in pools:
            ta = p.get("tokenA", {})
            tb = p.get("tokenB", {})
            ma = ta.get("mint", "") if isinstance(ta, dict) else ""
            mb = tb.get("mint", "") if isinstance(tb, dict) else ""
            if (mint_a in [ma, mb]) and (mint_b in [ma, mb]):
                addr = p.get("address", "")
                tvl = p.get("tvl", 0)
                if isinstance(tvl, dict):
                    tvl = tvl.get("value", 0)
                vol = p.get("volume", {})
                vol_day = vol.get("day", 0) if isinstance(vol, dict) else 0

                # Read on-chain sqrt_price
                try:
                    data = rpc.get_account(addr)
                    price = read_sqrt_price(data, dec_a, dec_b, offset_hint=65)
                    if price and price > 0 and float(tvl) > 100:
                        results.append(
                            PriceQuote(
                                dex="orca_whirlpool",
                                pool=addr,
                                price=price,
                                pair=pair_name,
                                source="on_chain",
                                tvl=float(tvl),
                                volume_24h=(float(vol_day) if isinstance(vol_day, (int, float)) else 0),
                                timestamp=time.time(),
                            )
                        )
                except Exception:
                    pass
    except Exception:
        pass
    return results


def fetch_jupiter_quote(pair_name: str) -> PriceQuote | None:
    """Get real-time quote from Jupiter API."""
    tokens = pair_name.split("/")
    mint_a = TOKENS.get(tokens[0], {}).get("mint", SOL_MINT)
    mint_b = TOKENS.get(tokens[1], {}).get("mint", USDC_MINT)
    dec_a = TOKENS.get(tokens[0], {}).get("decimals", 9)
    dec_b = TOKENS.get(tokens[1], {}).get("decimals", 6)
    try:
        resp = requests.get(
            "https://quote-api.jup.ag/v6/quote",
            params={
                "inputMint": mint_a,
                "outputMint": mint_b,
                "amount": str(10**dec_a),
                "slippageBps": "50",
            },
            timeout=10,
        )
        if resp.status_code == 200:
            out = int(resp.json().get("outAmount", "0"))
            if out > 0:
                return PriceQuote(
                    dex="jupiter",
                    pool="aggregator",
                    price=out / (10**dec_b),
                    pair=pair_name,
                    source="api",
                    timestamp=time.time(),
                )
    except Exception:
        pass
    return None


def fetch_raydium_quote(pair_name: str) -> PriceQuote | None:
    """Get real-time quote from Raydium API."""
    tokens = pair_name.split("/")
    mint_a = TOKENS.get(tokens[0], {}).get("mint", SOL_MINT)
    mint_b = TOKENS.get(tokens[1], {}).get("mint", USDC_MINT)
    dec_a = TOKENS.get(tokens[0], {}).get("decimals", 9)
    dec_b = TOKENS.get(tokens[1], {}).get("decimals", 6)
    try:
        resp = requests.get(
            "https://transaction-v1.raydium.io/compute/swap-base-in",
            params={
                "inputMint": mint_a,
                "outputMint": mint_b,
                "amount": str(10**dec_a),
                "slippageBps": "50",
                "txVersion": "V0",
            },
            timeout=10,
        )
        if resp.status_code == 200 and resp.json().get("success"):
            out = int(resp.json()["data"].get("outputAmount", "0"))
            if out > 0:
                return PriceQuote(
                    dex="raydium_quote",
                    pool="api",
                    price=out / (10**dec_b),
                    pair=pair_name,
                    source="api",
                    timestamp=time.time(),
                )
    except Exception:
        pass
    return None


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════


def fetch_pair(pair_name: str) -> list[PriceQuote]:
    """Fetch all prices for a single token pair."""
    all_quotes = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [
            pool.submit(fetch_raydium_api, pair_name),
            pool.submit(fetch_orca_api, pair_name),
            pool.submit(fetch_jupiter_quote, pair_name),
            pool.submit(fetch_raydium_quote, pair_name),
        ]
        for f in as_completed(futures):
            try:
                result = f.result(timeout=30)
                if isinstance(result, list):
                    all_quotes.extend(result)
                elif result:
                    all_quotes.append(result)
            except Exception:
                pass
    return all_quotes


def fetch_all_pairs(pairs: list[str] = None) -> list[PriceQuote]:
    """Fetch prices for multiple token pairs."""
    if pairs is None:
        pairs = TOKEN_PAIRS
    all_quotes = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fetch_pair, p): p for p in pairs}
        for f in as_completed(futures):
            try:
                all_quotes.extend(f.result(timeout=60))
            except Exception:
                pass
    return all_quotes


def find_arbitrage(quotes: list[PriceQuote], min_spread_pct: float = 0.05) -> list[dict]:
    """Find arbitrage opportunities within each pair."""
    opps = []
    by_pair = {}
    for q in quotes:
        by_pair.setdefault(q.pair, []).append(q)

    for pair, pair_quotes in by_pair.items():
        if len(pair_quotes) < 2:
            continue
        for i in range(len(pair_quotes)):
            for j in range(i + 1, len(pair_quotes)):
                q1, q2 = pair_quotes[i], pair_quotes[j]
                spread = abs(q1.price - q2.price)
                mn = min(q1.price, q2.price)
                if mn > 0:
                    pct = (spread / mn) * 100
                    if pct >= min_spread_pct:
                        buy = q1 if q1.price < q2.price else q2
                        sell = q2 if q1.price < q2.price else q1
                        opps.append(
                            {
                                "pair": pair,
                                "buy": buy.dex,
                                "sell": sell.dex,
                                "buy_price": buy.price,
                                "sell_price": sell.price,
                                "spread_pct": pct,
                                "spread_usd": spread,
                            }
                        )
    return sorted(opps, key=lambda x: x["spread_pct"], reverse=True)


if __name__ == "__main__":
    print("=" * 95)
    print("SOLANA DEX PRICE FETCHER v3 — 125+ POOLS, 11 TOKEN PAIRS")
    print("=" * 95)

    quotes = fetch_all_pairs()
    quotes.sort(key=lambda q: (q.pair, q.price))

    current_pair = ""
    for q in quotes:
        if q.pair != current_pair:
            current_pair = q.pair
            print(f"\n{'─'*95}")
            print(f"  {q.pair}")
            print(f"{'─'*95}")
            print(f"  {'DEX':<25} | {'Price':>16} | {'TVL':>14} | {'Vol 24h':>14} | {'Source'}")
            print(f"  {'-'*85}")

        tvl = f"${q.tvl:,.0f}" if q.tvl > 0 else ""
        vol = f"${q.volume_24h:,.0f}" if q.volume_24h > 0 else ""
        print(f"  {q.dex:<25} | {q.price:>16.8f} | {tvl:>14} | {vol:>14} | {q.source}")

    print(f"\n{'='*95}")
    print(f"Total pools: {len(quotes)}")

    # Arbitrage
    print(f"\n{'='*95}")
    print("ARBITRAGE OPPORTUNITIES (>0.1%)")
    print("=" * 95)

    arbs = find_arbitrage(quotes, min_spread_pct=0.1)
    if arbs:
        for a in arbs[:20]:
            print(
                f"  [{a['pair']}] Buy {a['buy']:<22} @ {a['buy_price']:.8f} -> "
                f"Sell {a['sell']:<22} @ {a['sell_price']:.8f} "
                f"= {a['spread_pct']:.3f}%"
            )
    else:
        print("  No significant arbitrage opportunities found.")
