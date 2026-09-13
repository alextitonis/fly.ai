#!/usr/bin/env python3
"""
Zero-result chain on-chain verifier.

Goal:
- For chains with total_liquidity_usd == 0 in multi_chain_prices.json,
  verify whether DEX infrastructure exists directly on-chain via RPC.

Checks:
1) RPC liveness (eth_blockNumber)
2) Known verified factories (verified_factories.json) -> allPairsLength
3) Registry address sanity (eth_getCode on top DEX addresses)
4) Router fallback (factory() -> allPairsLength)

Output:
- ~/.hermes/data/zero_result_rpc_report.json
"""

import json
import re
import ssl
import urllib.request
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config
from datetime import datetime, UTC

DATA = "/home/terexitarius/.hermes/data"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

SEL_ALL_PAIRS = "0x574f2ba3"
SEL_FACTORY = "0xc45a0155"


def rpc_call(url: str, method: str, params: list, timeout: int = 8):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            return json.loads(resp.read().decode()).get("result")
    except Exception:
        return None


def is_addr(a: str) -> bool:
    return isinstance(a, str) and bool(re.fullmatch(r"0x[a-fA-F0-9]{40}", a))


def to_int(x: str):
    try:
        return int(x, 16)
    except Exception:
        return None


def main():
    prices = json.load(open(f"{DATA}/multi_chain_prices.json"))["chains"]
    rpc_map = json.load(open(f"{DATA}/chain_rpc_urls.json"))
    all_dex = json.load(open(f"{DATA}/all_chain_dexs.json"))["chains"]
    verified_factories = json.load(open(f"{DATA}/verified_factories.json"))

    # ds_id -> registry chain names for rpc map
    ds_to_chain = {
        "gnosis": "xDai",
        "polygonzkevm": "Polygon zkEVM",
        "moonbeam": "Moonbeam",
        "unichain": "Unichain",
        "evmos": "Evmos",
        "injective": "Injective",
        "fraxtal": "Fraxtal",
        "bob": "BOB",
        "canto": "Canto",
        "hemi": "Hemi",
        "corn": "Corn",
        "swellchain": "Swellchain",
        "wanchain": "Wanchain",
        "shiden": "Shiden",
        "apechain": "ApeChain",
        "pulsechain": "Pulse",
    }

    zero_targets = []
    for ds_id, row in prices.items():
        liq = float(row.get("total_liquidity_usd", 0) or 0)
        if liq != 0:
            continue
        chain = ds_to_chain.get(ds_id)
        if not chain:
            continue
        if chain not in rpc_map:
            continue
        cid = rpc_map[chain].get("chain_id", 0)
        if cid <= 0:
            continue
        zero_targets.append((ds_id, chain))

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "targets": len(zero_targets),
        "chains": {},
    }

    for ds_id, chain in zero_targets:
        rpc_urls = rpc_map.get(chain, {}).get("rpcs", [])
        live_rpc = None
        block = None
        for u in rpc_urls:
            b = rpc_call(u, "eth_blockNumber", [])
            if b:
                live_rpc = u
                block = to_int(b)
                break

        chain_out = {
            "ds_id": ds_id,
            "chain": chain,
            "rpc_live": bool(live_rpc),
            "rpc": live_rpc,
            "block": block,
            "known_factory_verified": None,
            "registry_addresses_scanned": 0,
            "registry_addresses_with_code": 0,
            "router_factory_hits": 0,
            "notes": [],
        }

        if not live_rpc:
            chain_out["notes"].append("No responsive RPC endpoint")
            report["chains"][ds_id] = chain_out
            continue

        # Known verified factories first
        # map chain -> verified_factories key
        vf_key = None
        if chain == "xDai":
            vf_key = "xdai"
        elif chain == "Canto":
            vf_key = "canto"
        elif chain == "Pulse":
            vf_key = "pulse"

        if vf_key and vf_key in verified_factories:
            fac = verified_factories[vf_key].get("factory")
            if is_addr(fac):
                code = rpc_call(live_rpc, "eth_getCode", [fac, "latest"])
                apl = rpc_call(live_rpc, "eth_call", [{"to": fac, "data": SEL_ALL_PAIRS}, "latest"])
                pairs = to_int(apl) if apl else None
                chain_out["known_factory_verified"] = {
                    "factory": fac,
                    "code": bool(code and code != "0x"),
                    "pairs": pairs,
                    "expected_pairs": verified_factories[vf_key].get("pairs_count"),
                }

        # Registry top addresses sanity scan
        dexs = (all_dex.get(chain) or {}).get("dexes", [])
        seen = set()
        candidates = []
        for d in dexs:
            a = d.get("address")
            if is_addr(a) and a not in seen:
                seen.add(a)
                candidates.append((d.get("name", "?"), a, d.get("tvl_raw", 0)))
        candidates.sort(key=lambda x: x[2], reverse=True)
        candidates = candidates[:12]

        for name, addr, _ in candidates:
            chain_out["registry_addresses_scanned"] += 1
            code = rpc_call(live_rpc, "eth_getCode", [addr, "latest"])
            if not code or code == "0x":
                continue
            chain_out["registry_addresses_with_code"] += 1

            # router -> factory probe
            fac = rpc_call(live_rpc, "eth_call", [{"to": addr, "data": SEL_FACTORY}, "latest"])
            if fac and fac != "0x" and len(fac) >= 42:
                faddr = "0x" + fac[-40:]
                if is_addr(faddr):
                    apl = rpc_call(
                        live_rpc,
                        "eth_call",
                        [{"to": faddr, "data": SEL_ALL_PAIRS}, "latest"],
                    )
                    p = to_int(apl) if apl else None
                    if p and p > 0:
                        chain_out["router_factory_hits"] += 1
                        chain_out["notes"].append(f"{name}: router.factory() -> {faddr} pairs={p}")

        if chain_out["registry_addresses_scanned"] == 0:
            chain_out["notes"].append("No hex contract addresses in top registry DEX entries")
        elif chain_out["registry_addresses_with_code"] == 0:
            chain_out["notes"].append(
                "Registry addresses are not deployed contracts on this chain (likely token/global addresses)"
            )
        else:
            chain_out["notes"].append(
                f"Registry code hits: {chain_out['registry_addresses_with_code']}/{chain_out['registry_addresses_scanned']}"
            )

        report["chains"][ds_id] = chain_out

    # summary
    verified = 0
    for c in report["chains"].values():
        kf = c.get("known_factory_verified")
        if kf and kf.get("pairs") and kf.get("pairs") > 0 or c.get("router_factory_hits", 0) > 0:
            verified += 1

    report["summary"] = {
        "verified_onchain": verified,
        "unverified": len(report["chains"]) - verified,
    }

    out = f"{DATA}/zero_result_rpc_report.json"
    with open(out, "w") as f:
        json.dump(report, f, indent=2)

    print(f"Targets: {report['targets']}")
    print(f"Verified on-chain: {report['summary']['verified_onchain']}")
    print(f"Unverified: {report['summary']['unverified']}")
    print(f"Saved: {out}")

    # brief per-chain line
    for ds_id, row in report["chains"].items():
        kf = row.get("known_factory_verified")
        kpairs = kf.get("pairs") if kf else None
        print(
            f"- {ds_id:12} rpc_live={row['rpc_live']} code={row['registry_addresses_with_code']}/{row['registry_addresses_scanned']} "
            f"known_pairs={kpairs} router_hits={row['router_factory_hits']}"
        )


if __name__ == "__main__":
    main()
