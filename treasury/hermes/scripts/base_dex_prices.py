#!/usr/bin/env python3
"""
Base DEX Price Fetcher v4
Factory-based pool discovery + V2/V3 price quotes from ALL verified DEXes.
V2: getAmountsOut | V3: slot0 sqrtPriceX96 | 7 pairs

Usage: python base_dex_prices.py [--amount 0.01] [--all-pairs] [--json]
"""

import argparse
import json
import urllib.request
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config
import ssl
import time
import urllib.request

RPCS = ["https://base.llamarpc.com", "https://base.drpc.org", "https://1rpc.io/base"]
rpc_idx = 0
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def rpc_call(method, params=None):
    if params is None:
        params = []
    global rpc_idx
    for _ in range(5):
        try:
            url = RPCS[rpc_idx % len(RPCS)]
            payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                return json.loads(resp.read().decode())
        except Exception:
            rpc_idx += 1
            time.sleep(1)
    return {"error": "failed"}


def call(to, data):
    r = rpc_call("eth_call", [{"to": to, "data": data}, "latest"])
    return r


TOKENS = {
    "WETH": ("0x4200000000000000000000000000000000000006", 18),
    "USDC": ("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6),
    "USDT": ("0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", 6),
    "DAI": ("0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", 18),
    "AERO": ("0x940181a94A35A4569D4521129DfD34b47d5Ed16c", 18),
    "cbETH": ("0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", 18),
    "cbBTC": ("0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", 8),
}

PAIRS = [
    ("WETH", "USDC", [100, 500, 3000, 10000]),
    ("WETH", "DAI", [500, 3000, 10000]),
    ("WETH", "USDT", [500, 3000, 10000]),
    ("WETH", "AERO", [100, 500, 3000, 10000]),
    ("WETH", "cbETH", [100, 500, 3000]),
    ("WETH", "cbBTC", [100, 500, 3000]),
    ("USDC", "USDT", [100, 500, 3000]),
    ("USDC", "DAI", [100, 500, 3000]),
]

FACTORIES = {
    # V2 factories
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
    "PancakeSwap V2": {
        "type": "v2",
        "factory": "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
        "router": "0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb",
    },
    "SushiSwap V2": {
        "type": "v2",
        "factory": "0x71524B4f93c58fcbF659783fCBe56AcF49992dDa",
        "router": "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891",
    },
    # V3 factories
    "Uniswap V3": {"type": "v3", "factory": "0x33128a8fC17869897dcE68Ed026d694621f6FDfD"},
    "PancakeSwap V3": {"type": "v3", "factory": "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"},
}


def check_v2(factory, tA, tB):
    data = "0xe6a43905" + tA[2:].zfill(64) + tB[2:].zfill(64)
    r = call(factory, data)
    result = r.get("result", "")
    if result and len(result) >= 66:
        addr = "0x" + result[26:66]
        return addr if addr != "0x" + "0" * 40 else None
    return None


def check_v3(factory, tA, tB, fee):
    data = "0x1698ee82" + tA[2:].zfill(64) + tB[2:].zfill(64) + hex(fee)[2:].zfill(64)
    r = call(factory, data)
    result = r.get("result", "")
    if result and len(result) >= 66:
        addr = "0x" + result[26:66]
        return addr if addr != "0x" + "0" * 40 else None
    return None


def quote_v2(router, tA, tB, amount_wei):
    path_off = "0" * 62 + "40"
    path_len = "0" * 62 + "02"
    data = "0xd06ca61f" + hex(amount_wei)[2:].zfill(64) + path_off + path_len + tA[2:].zfill(64) + tB[2:].zfill(64)
    r = call(router, data)
    result = r.get("result", "")
    if result and len(result) >= 258:
        try:
            if int(result[66:130], 16) >= 2:
                return int(result[194:258], 16)
        except ValueError:
            pass
    return None


def quote_v3_slot0(pool, dec0, dec1):
    """Get spot price from V3 pool slot0"""
    r = call(pool, "0x3850c7bd")
    result = r.get("result", "")
    if result and len(result) >= 66:
        try:
            sqrt = int(result[:66], 16)
            if sqrt > 0:
                price = (sqrt / (2**96)) ** 2 * (10 ** (dec0 - dec1))
                return price
        except ValueError:
            pass
    return None


def discover_and_quote(verbose=True):
    if verbose:
        print("=== POOL DISCOVERY ===\n")

    pools = []

    for dex, cfg in FACTORIES.items():
        for tA_name, tB_name, fees in PAIRS:
            tA = TOKENS[tA_name][0]
            tB = TOKENS[tB_name][0]

            if cfg["type"] == "v2":
                pool = check_v2(cfg["factory"], tA, tB)
                if pool:
                    pools.append(
                        {"dex": dex, "pair": f"{tA_name}-{tB_name}", "pool": pool, "type": "v2", "config": cfg}
                    )
                    if verbose:
                        print(f"  {dex:<20} {tA_name}-{tB_name:<12} V2  pool={pool}")

            elif cfg["type"] == "v3":
                for fee in fees:
                    pool = check_v3(cfg["factory"], tA, tB, fee)
                    if pool:
                        pools.append(
                            {
                                "dex": dex,
                                "pair": f"{tA_name}-{tB_name}",
                                "pool": pool,
                                "type": "v3",
                                "config": cfg,
                                "fee": fee,
                                "dec0": TOKENS[tA_name][1],
                                "dec1": TOKENS[tB_name][1],
                            }
                        )
                        if verbose:
                            print(f"  {dex:<20} {tA_name}-{tB_name:<12} V3  fee={fee}bps  pool={pool}")

            time.sleep(0.2)

    if verbose:
        print(f"\nDiscovered {len(pools)} pools\n")

    # Quote
    results = []
    if verbose:
        print("=== PRICE QUOTES ===\n")
        print(f"{'DEX':<20}{'Pair':<14}{'Fee':<8}{'Price':>14}{'Type'}")
        print("=" * 62)

    for p in pools:
        dex = p["dex"]
        pair = p["pair"]
        tA_name, tB_name = pair.split("-")
        dec_out = TOKENS[tB_name][1]

        if p["type"] == "v2":
            amount_wei = int(0.01 * 10 ** TOKENS[tA_name][1])
            out = quote_v2(p["config"]["router"], TOKENS[tA_name][0], TOKENS[tB_name][0], amount_wei)
            if out and out > 0:
                price = (out / (10**dec_out)) / 0.01
                results.append({"dex": dex, "pair": pair, "price": price, "fee": "V2"})
                if verbose:
                    print(f"{dex:<20}{pair:<14}{'V2':<8}{price:>14,.2f}{'swap':>6}")
            else:
                if verbose:
                    print(f"{dex:<20}{pair:<14}{'V2':<8}{'FAIL':>14}{'':>6}")

        elif p["type"] == "v3":
            spot = quote_v3_slot0(p["pool"], p["dec0"], p["dec1"])
            if spot and spot > 0:
                results.append(
                    {"dex": dex, "pair": pair, "price": spot, "fee": f"{p['fee']}bps"}
                )
                if verbose:
                    print(f"{dex:<20}{pair:<14}{p['fee']:<8}{spot:>14,.2f}{'spot':>6}")
            else:
                if verbose:
                    print(f"{dex:<20}{pair:<14}{p['fee']:<8}{'FAIL':>14}{'':>6}")

        time.sleep(0.8)

    # Summary
    if verbose and results:
        print("\n=== SUMMARY ===\n")
        pairs_set = sorted(set(r["pair"] for r in results))
        for pair in pairs_set:
            pr = [r for r in results if r["pair"] == pair]
            prices = [r["price"] for r in pr]
            spread = (max(prices) - min(prices)) / min(prices) * 100
            best = max(pr, key=lambda x: x["price"])
            print(
                f"{pair}: {len(pr)} quotes, spread {spread:.2f}%, best @ {best['dex']} {best['fee']} ({best['price']:,.2f})"
            )

    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    block = rpc_call("eth_blockNumber")
    if "result" in block:
        print(f"Base block: {int(block['result'], 16):,}\n")

    results = discover_and_quote(not args.json)
    if args.json:
        print(json.dumps(results, indent=2))
