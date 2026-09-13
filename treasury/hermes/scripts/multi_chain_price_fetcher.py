#!/usr/bin/env python3
"""
Multi-Chain DEX Price Fetcher v2.0
Fetches live prices from 53+ chains using DexScreener as primary source.
Chains are tiered by liquidity - A(>$1M), B(>$100k), C(>$10k), D(<$10k).

Native token addresses used for accurate pair discovery.
"""

import json
import ssl
import sys
import time
import urllib.request
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config
from datetime import datetime

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

DATA_DIR = "/home/terexitarius/.hermes/data"
INTEGRATION_FILE = f"{DATA_DIR}/dex_integration_tiers.json"
OUTPUT_FILE = f"{DATA_DIR}/multi_chain_prices.json"

# Native wrapped token addresses for accurate chain-specific pair discovery
NATIVE_TOKEN_ADDRS = dict(
    [
        ("avalanche", "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"),  # WAVAX
        ("fantom", "0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83"),  # WFTM
        ("sonic", "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38"),  # wS
        ("tron", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"),  # USDT on TRON
        ("astar", "0xAeaaf0e2c81Af264101B9129C00F4440cCF0F720"),  # WASTR
        ("moonriver", "0x98878B06940aE243284CA214f92Bb71a2b032B8A"),  # WMOVR
        ("celo", "0x471EcE3750Da237f93B8E339c536989b8978a438"),  # CELO
        ("cronos", "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23"),  # WCRO
        ("arbitrumnova", "0x722E8BdD2ce80A4422E880164f2079488e115365"),  # WETH on Nova
        ("iotex", "0xa00744882684C3e4747faEFD68D283eA44099D03"),  # WIOTX
        ("bsc", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"),  # WBNB
        ("moonbeam", "0xAcc15dC74880C9944775448304B263D191c6077F"),  # WGLMR
        ("telos", "0xD102cE6A4dB07D247fcc28F819B8B62FA8AE9E5d"),  # WTLOS
    ]
)


def fetch_json(url, timeout=10):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None


def fetch_chain_pairs(chain_id, max_pairs=6):
    """Fetch top pairs for a chain, using native token address if available."""
    token_addr = NATIVE_TOKEN_ADDRS.get(chain_id)
    if token_addr:
        data = fetch_json(f"https://api.dexscreener.com/latest/dex/tokens/{token_addr}")
    else:
        data = fetch_json(f"https://api.dexscreener.com/latest/dex/search?q={chain_id}")

    if not data:
        return []
    pairs = [p for p in (data.get("pairs") or []) if p.get("chainId") == chain_id]
    return pairs[:max_pairs]


def process_pairs(pairs):
    """Extract price, liquidity, volume from pairs."""
    results = []
    for p in pairs:
        base = p.get("baseToken", {})
        quote = p.get("quoteToken", {})
        liq = p.get("liquidity", {})
        vol = p.get("volume", {})
        results.append(
            {
                "dex": p.get("dexId", "?"),
                "pair": f"{base.get('symbol','?')}/{quote.get('symbol','?')}",
                "pair_address": p.get("pairAddress", ""),
                "price_usd": float(p.get("priceUsd") or 0),
                "price_native": float(p.get("priceNative") or 0),
                "liquidity_usd": float(liq.get("usd") or 0),
                "volume_24h": float(vol.get("h24") or 0),
                "base_token": base.get("address", ""),
                "quote_token": quote.get("address", ""),
            }
        )
    return results


def main():
    tiers = json.load(open(INTEGRATION_FILE))

    # Sort by tier then liquidity
    tier_order = {"A": 0, "B": 1, "C": 2, "D": 3}
    sorted_chains = sorted(
        tiers.items(),
        key=lambda x: (tier_order.get(x[1]["tier"], 4), -x[1]["liquidity_usd"]),
    )

    results = {}
    total = len(sorted_chains)
    total_liq = 0
    total_pairs = 0

    print(f"Fetching prices for {total} chains...")
    for i, (chain_id, info) in enumerate(sorted_chains):
        sys.stdout.write(f"\r[{i+1}/{total}] {chain_id:25} tier={info['tier']}  ")
        sys.stdout.flush()

        pairs = fetch_chain_pairs(chain_id)
        processed = process_pairs(pairs)

        chain_liq = sum(p["liquidity_usd"] for p in processed)
        chain_vol = sum(p["volume_24h"] for p in processed)
        total_liq += chain_liq
        total_pairs += len(processed)

        results[chain_id] = {
            "tier": info["tier"],
            "pairs_found": len(processed),
            "total_liquidity_usd": chain_liq,
            "total_volume_24h": chain_vol,
            "dexes": list(set(p["dex"] for p in processed)),
            "pairs": processed,
            "fetched_at": datetime.utcnow().isoformat(),
        }
        time.sleep(0.15)

    print("\n\nDone!")
    print(f"Chains fetched: {len(results)}")
    print(f"Total pairs: {total_pairs}")
    print(f"Total liquidity: ${total_liq:,.0f}")

    # Summary table
    print(f"\n{'='*80}")
    print(" TOP 30 CHAINS BY LIQUIDITY")
    print(f"{'='*80}")
    sorted_results = sorted(results.items(), key=lambda x: x[1]["total_liquidity_usd"], reverse=True)
    for chain_id, r in sorted_results[:30]:
        dex_str = ", ".join(r["dexes"][:2])
        print(
            f"  [{r['tier']}] {chain_id:22} {r['pairs_found']:2}p "
            f"${r['total_liquidity_usd']:>14,.0f}  ${r['total_volume_24h']:>12,.0f}  {dex_str}"
        )

    with open(OUTPUT_FILE, "w") as f:
        json.dump(
            {
                "fetched_at": datetime.utcnow().isoformat(),
                "total_chains": len(results),
                "total_pairs": total_pairs,
                "total_liquidity_usd": total_liq,
                "chains": results,
            },
            f,
            indent=2,
        )
    print(f"\nSaved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
