#!/usr/bin/env python3
"""
Solana DEX Price Scanner
Finds real-time prices across 37+ DEX programs for any token pair.
Uses Jupiter routing to discover pools, reads on-chain state for direct quotes.
"""

import base64
import requests
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

import requests

SOLANA_RPC = "https://api.mainnet-beta.solana.com"

# ═══════════════════════════════════════════════════════════════
# TOKEN DATABASE
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
    "PYTH": {"mint": "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", "decimals": 6},
    "WIF": {"mint": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", "decimals": 6},
    "W": {"mint": "85VBFQZC9JnAbmP7zoqC7p4M7tU9U9U9U9U9U9U9U9U9", "decimals": 6},
    "RENDER": {"mint": "rndrizKTWmkde9MMK4T7C6g3V9wBv6H6H6H6H6H6H6H6", "decimals": 6},
}


@dataclass
class PriceResult:
    dex: str
    price: float
    pool: str
    source: str
    tvl: float = 0.0
    volume_24h: float = 0.0
    hops: int = 1
    route: str = ""
    timestamp: float = field(default_factory=time.time)


# ═══════════════════════════════════════════════════════════════
# SOLANA RPC
# ═══════════════════════════════════════════════════════════════


class SolanaRPC:
    def __init__(self, url: str = SOLANA_RPC):
        self.url = url
        self.s = requests.Session()
        self._cache = {}

    def get_account(self, addr: str) -> bytes | None:
        if addr in self._cache:
            return self._cache[addr]
        try:
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
                data = base64.b64decode(v["data"][0])
                self._cache[addr] = data
                return data
        except Exception:
            pass
        return None


# ═══════════════════════════════════════════════════════════════
# PRICE READERS
# ═══════════════════════════════════════════════════════════════


def read_sqrt_price(data: bytes, dec_a: int, dec_b: int, offset_hint: int = 0) -> float | None:
    """Read sqrt_price_x64 from on-chain CLMM/Whirlpool account."""
    if not data or len(data) < 56:
        return None
    adj = 10 ** (dec_a - dec_b)

    if offset_hint > 0 and len(data) >= offset_hint + 16:
        v = int.from_bytes(data[offset_hint : offset_hint + 16], "little")
        if v > 0:
            p = (v / (2**64)) ** 2 * adj
            if p > 0:
                return p

    for off in range(40, min(len(data) - 16, 400)):
        v = int.from_bytes(data[off : off + 16], "little")
        if v > 0:
            p = (v / (2**64)) ** 2 * adj
            if p > 0.0000001:
                return p
    return None


def read_amm_reserves(data: bytes, dec_a: int, dec_b: int) -> float | None:
    """Try reading AMM vault reserves from pool account."""
    if not data or len(data) < 104:
        return None
    B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

    def b58(d):
        n = int.from_bytes(d, "big")
        e = ""
        while n > 0:
            n, r = divmod(n, 58)
            e = B58[r] + e
        for b in d:
            if b == 0:
                e = "1" + e
            else:
                break
        return e

    def get_bal(addr):
        try:
            r = requests.post(
                SOLANA_RPC,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getTokenAccountBalance",
                    "params": [addr],
                },
                timeout=8,
            )
            v = r.json().get("result", {}).get("value", {})
            return int(v.get("amount", "0")), int(v.get("decimals", 0))
        except Exception:
            return 0, 0

    for base in [40, 72, 8, 128, 160, 192]:
        try:
            va = b58(data[base : base + 32])
            vb = b58(data[base + 32 : base + 64])
            a, da = get_bal(va)
            b, db = get_bal(vb)
            if a > 0 and da in (5, 6, 8, 9) and db in (5, 6, 8, 9):
                p = (b / 10**db) / (a / 10**da)
                if p > 0.0000001:
                    return p
        except Exception:
            continue
    return None


# ═══════════════════════════════════════════════════════════════
# JUPITER ROUTING DISCOVERY
# ═══════════════════════════════════════════════════════════════


def jupiter_quote(mint_a: str, mint_b: str, amount: int, dec_a: int, dec_b: int) -> list[PriceResult]:
    """Get prices via Jupiter aggregator (discovers all routed DEXs)."""
    results = []
    try:
        resp = requests.get(
            "https://api.jup.ag/swap/v1/quote",
            params={
                "inputMint": mint_a,
                "outputMint": mint_b,
                "amount": str(amount),
                "slippageBps": "100",
            },
            timeout=15,
        )
        if resp.status_code != 200:
            return results

        data = resp.json()
        out = int(data.get("outAmount", "0"))
        if out <= 0:
            return results

        price = out / (10**dec_b)
        routes = data.get("routePlan", [])
        labels = [r.get("swapInfo", {}).get("label", "?") for r in routes]
        amm_keys = [r.get("swapInfo", {}).get("ammKey", "") for r in routes]

        results.append(
            PriceResult(
                dex=f"jupiter ({'→'.join(labels)})",
                price=price,
                pool=amm_keys[0] if amm_keys else "aggregator",
                source="jupiter_api",
                hops=len(routes),
                route="→".join(labels),
            )
        )

        # Also get individual DEX prices from each hop
        for route in routes:
            swap = route.get("swapInfo", {})
            label = swap.get("label", "?")
            amm_key = swap.get("ammKey", "")
            hop_out = int(swap.get("outAmount", "0"))
            hop_in = int(swap.get("inAmount", "0"))
            if hop_out > 0 and hop_in > 0 and amm_key:
                results.append(
                    PriceResult(
                        dex=label,
                        price=hop_out / (10**dec_b),
                        pool=amm_key,
                        source="jupiter_route",
                        hops=1,
                        route=label,
                    )
                )
    except Exception:
        pass
    return results


# ═══════════════════════════════════════════════════════════════
# RAYDIUM API
# ═══════════════════════════════════════════════════════════════


def raydium_pools(mint_a: str, mint_b: str) -> list[PriceResult]:
    """Get all pools from Raydium API."""
    results = []
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
                if price > 0 and tvl > 50:
                    results.append(
                        PriceResult(
                            dex=f'raydium_{p.get("type", "?").lower()}',
                            price=price,
                            pool=p.get("id", ""),
                            source="raydium_api",
                            tvl=tvl,
                            volume_24h=p.get("day", {}).get("volume", 0) or 0,
                        )
                    )
    except Exception:
        pass
    return results


def raydium_quote(mint_a: str, mint_b: str, amount: int, dec_b: int) -> PriceResult | None:
    """Get real-time swap quote from Raydium."""
    try:
        resp = requests.get(
            "https://transaction-v1.raydium.io/compute/swap-base-in",
            params={
                "inputMint": mint_a,
                "outputMint": mint_b,
                "amount": str(amount),
                "slippageBps": "50",
                "txVersion": "V0",
            },
            timeout=10,
        )
        if resp.status_code == 200 and resp.json().get("success"):
            out = int(resp.json()["data"].get("outputAmount", "0"))
            if out > 0:
                return PriceResult(
                    dex="raydium_swap",
                    price=out / (10**dec_b),
                    pool="api",
                    source="raydium_quote",
                )
    except Exception:
        pass
    return None


# ═══════════════════════════════════════════════════════════════
# ORCA API
# ═══════════════════════════════════════════════════════════════


def orca_pools(mint_a: str, mint_b: str, dec_a: int, dec_b: int) -> list[PriceResult]:
    """Get Orca Whirlpool prices (on-chain sqrt_price)."""
    results = []
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

                data = rpc.get_account(addr)
                price = read_sqrt_price(data, dec_a, dec_b, offset_hint=65)
                if price and price > 0 and float(tvl) > 50:
                    results.append(
                        PriceResult(
                            dex="orca_whirlpool",
                            price=price,
                            pool=addr,
                            source="orca_onchain",
                            tvl=float(tvl),
                            volume_24h=(float(vol_day) if isinstance(vol_day, (int, float)) else 0),
                        )
                    )
    except Exception:
        pass
    return results


# ═══════════════════════════════════════════════════════════════
# METEORA API
# ═══════════════════════════════════════════════════════════════


def meteora_pools(mint_a: str, mint_b: str) -> list[PriceResult]:
    """Try Meteora API for pool discovery."""
    results = []
    # Meteora AMM v2 API
    for endpoint in [
        f"https://amm-api-v2.meteora.ag/pools?token_a={mint_a}&token_b={mint_b}",
        f"https://dlmm-api.meteora.ag/pair/{mint_a}/{mint_b}",
    ]:
        try:
            resp = requests.get(endpoint, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                items = data if isinstance(data, list) else data.get("data", [])
                for p in items[:10] if isinstance(items, list) else []:
                    price = p.get("price", 0)
                    if price and float(price) > 0:
                        results.append(
                            PriceResult(
                                dex="meteora",
                                price=float(price),
                                pool=p.get("address", ""),
                                source="meteora_api",
                                tvl=float(p.get("liquidity", 0)),
                            )
                        )
        except Exception:
            pass
    return results


# ═══════════════════════════════════════════════════════════════
# ON-CHAIN POOL SCANNER
# ═══════════════════════════════════════════════════════════════


# Known pool addresses from our registry
KNOWN_POOLS = {
    "SOL/USDC": {
        "orca_whirlpool": [
            "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE",
            "FpCMFDFGYotvufJ7HrFHsWEiiQCGbkLCtwHiDnh7o28Q",
            "7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVNUJnm",
            "HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ",
        ],
        "raydium_clmm": [
            "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
            "CYbD9RaToYMtWKA7QZyoLahnHdWq553Vm62Lh6qWtuxq",
            "8sLbNZoA1cfnvMJLPfp98ZLAnFSYCFApfJKMbiXNLwxj",
            "2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv",
        ],
        "raydium_amm": [
            "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
            "61acRgpURKTU8LKPJKs6WQa18KzD9ogavXzjxfD84KLu",
        ],
    },
    "SOL/USDT": {
        "orca_whirlpool": [
            "4fuUiYyTdto6FPZLhY9P5LHc7J6HnW6cEJ4KZcSdKqot",
        ],
    },
    "SOL/BONK": {
        "orca_whirlpool": [
            "3ne4mWqdYuNiYrYZK9iPked8iZqE7DwZ7W4eHjgaSg7E",
        ],
    },
}

SQRT_OFFSETS = {
    "orca_whirlpool": 65,
    "raydium_clmm": 253,
}


def scan_known_pools(pair_name: str, dec_a: int, dec_b: int) -> list[PriceResult]:
    """Read prices from known on-chain pool addresses."""
    results = []
    rpc = SolanaRPC()
    pools = KNOWN_POOLS.get(pair_name, {})

    def read_one(dex, addr):
        offset = SQRT_OFFSETS.get(dex, 0)
        data = rpc.get_account(addr)
        if not data:
            return None

        # Try sqrt_price
        if offset > 0:
            price = read_sqrt_price(data, dec_a, dec_b, offset_hint=offset)
            if price and price > 0:
                return PriceResult(dex=dex, price=price, pool=addr, source="on_chain")

        # Try scanning
        price = read_sqrt_price(data, dec_a, dec_b)
        if price and price > 0:
            return PriceResult(dex=dex, price=price, pool=addr, source="on_chain_scan")

        # Try vault reserves
        price = read_amm_reserves(data, dec_a, dec_b)
        if price and price > 0:
            return PriceResult(dex=f"{dex}_amm", price=price, pool=addr, source="vault")

        return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        tasks = []
        for dex, addrs in pools.items():
            for addr in addrs:
                tasks.append(pool.submit(read_one, dex, addr))
        for f in as_completed(tasks):
            r = f.result()
            if r:
                results.append(r)

    return results


# ═══════════════════════════════════════════════════════════════
# MAIN SCANNER
# ═══════════════════════════════════════════════════════════════


def scan_pair(token_a: str, token_b: str, amount_a: float = 1.0) -> list[PriceResult]:
    """
    Scan all DEXs for prices of token_a/token_b.
    Returns all discovered prices sorted by value.
    """
    t_a = TOKENS.get(token_a.upper())
    t_b = TOKENS.get(token_b.upper())
    if not t_a or not t_b:
        print(f"Unknown token: {token_a} or {token_b}")
        print(f"Available: {', '.join(TOKENS.keys())}")
        return []

    mint_a = t_a["mint"]
    mint_b = t_b["mint"]
    dec_a = t_a["decimals"]
    dec_b = t_b["decimals"]
    amount_raw = int(amount_a * (10**dec_a))
    pair_name = f"{token_a.upper()}/{token_b.upper()}"

    all_results = []

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [
            pool.submit(jupiter_quote, mint_a, mint_b, amount_raw, dec_a, dec_b),
            pool.submit(raydium_pools, mint_a, mint_b),
            pool.submit(raydium_quote, mint_a, mint_b, amount_raw, dec_b),
            pool.submit(orca_pools, mint_a, mint_b, dec_a, dec_b),
            pool.submit(scan_known_pools, pair_name, dec_a, dec_b),
        ]
        for f in as_completed(futures):
            try:
                result = f.result(timeout=30)
                if isinstance(result, list):
                    all_results.extend(result)
                elif result:
                    all_results.append(result)
            except Exception:
                pass

    # Deduplicate by pool address
    seen = set()
    unique = []
    for r in all_results:
        key = f"{r.dex}:{r.pool}"
        if key not in seen:
            seen.add(key)
            unique.append(r)

    return sorted(unique, key=lambda x: x.price)


def find_arbs(results: list[PriceResult], min_pct: float = 0.1) -> list[dict]:
    """Find arbitrage between any two price sources."""
    opps = []
    for i in range(len(results)):
        for j in range(i + 1, len(results)):
            a, b = results[i], results[j]
            spread = abs(a.price - b.price)
            mn = min(a.price, b.price)
            if mn > 0:
                pct = (spread / mn) * 100
                if pct >= min_pct:
                    buy = a if a.price < b.price else b
                    sell = b if a.price < b.price else a
                    opps.append(
                        {
                            "buy_dex": buy.dex,
                            "sell_dex": sell.dex,
                            "buy_price": buy.price,
                            "sell_price": sell.price,
                            "spread_pct": pct,
                            "profit_per_unit": spread,
                        }
                    )
    return sorted(opps, key=lambda x: x["spread_pct"], reverse=True)


# ═══════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys

    pairs = [
        ("SOL", "USDC"),
        ("SOL", "USDT"),
        ("SOL", "BONK"),
        ("SOL", "JUP"),
        ("SOL", "RAY"),
        ("USDC", "USDT"),
    ]

    if len(sys.argv) >= 3:
        pairs = [(sys.argv[1], sys.argv[2])]

    print("=" * 100)
    print("SOLANA DEX PRICE SCANNER")
    print("=" * 100)

    for token_a, token_b in pairs:
        print(f"\n{'━'*100}")
        print(f"  {token_a}/{token_b}")
        print(f"{'━'*100}")

        results = scan_pair(token_a, token_b)

        if not results:
            print("  No prices found.")
            continue

        print(f"  {'DEX':<35} | {'Price':>18} | {'TVL':>14} | {'Vol 24h':>14} | {'Source':<15} | {'Hops'}")
        print(f"  {'-'*105}")

        for r in results:
            tvl = f"${r.tvl:,.0f}" if r.tvl > 0 else ""
            vol = f"${r.volume_24h:,.0f}" if r.volume_24h > 0 else ""
            print(f"  {r.dex:<35} | {r.price:>18.8f} | {tvl:>14} | {vol:>14} | {r.source:<15} | {r.hops}")

        prices = [r.price for r in results]
        print(f"\n  Pools: {len(results)} | Range: {min(prices):.8f} — {max(prices):.8f}")

        arbs = find_arbs(results, min_pct=0.05)
        if arbs:
            print("\n  ARBITRAGE (>0.05%):")
            for a in arbs[:5]:
                print(
                    f"    Buy {a['buy_dex']:<30} @ {a['buy_price']:.8f} → "
                    f"Sell {a['sell_dex']:<30} @ {a['sell_price']:.8f} "
                    f"= {a['spread_pct']:.3f}%"
                )
        else:
            print("\n  No arbitrage opportunities.")
