#!/usr/bin/env python3
"""
PumpFun Creator Wallet Enrichment v2

Enrichment strategy:
1. Get SOL balance for each creator wallet
2. Check their tokens' current FDV/volume via Dexscreener/GMGN
3. Count how many of their tokens "bonded" (graduated from pump.fun)
4. Rank by: prolificacy + token performance + wallet activity
"""

import json
import sqlite3
import time
import urllib.request
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config

from hermes_screener.config import settings
from hermes_screener.utils import gmgn_cmd  # noqa: F401 – shared helper

DATA_DIR = settings.db_path.parent
DB_PATH = settings.db_path
GMGN_CLI = str(settings.gmgn_cli)
OUTPUT_PATH = DATA_DIR.parent / "token_screener" / "pumpfun_dev_wallets.json"
SOLANA_RPC = "https://api.mainnet-beta.solana.com"


# gmgn_cmd is imported from hermes_screener.utils


def get_sol_balance(wallet: str) -> float:
    """Get SOL balance via public RPC."""
    try:
        payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": [wallet]}).encode()
        req = urllib.request.Request(SOLANA_RPC, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            lamports = data.get("result", {}).get("value", 0)
            return lamports / 1e9
    except Exception:
        return 0


def get_token_info(token_addr: str) -> dict:
    """Get token info from GMGN."""
    data = gmgn_cmd(["token", "info", "--chain", "sol", "--address", token_addr, "--raw"])
    if data:
        return {
            "holder_count": data.get("holder_count", 0),
            "liquidity": data.get("liquidity", 0),
            "market_cap": data.get("market_cap", 0),
            "is_bonded": data.get("complete", False) or data.get("bonding_curve_progress", 0) >= 100,
        }
    return {}


def fetch_creators_with_tokens() -> list[dict]:
    """Fetch creators and their token addresses from DB."""
    conn = sqlite3.connect(str(DB_PATH), timeout=10)

    # Get creators
    creators = conn.execute("""
        SELECT contract_address, mentions, last_message_text, last_seen_at
        FROM telegram_contracts_unique
        WHERE last_source = 'pumpportal_creator'
        ORDER BY mentions DESC
    """).fetchall()

    results = []
    for wallet, count, desc, _last_seen in creators:
        # Extract token addresses from description
        # Format: "pumpfun_dev | tokens: NAME (ADDR...), NAME (ADDR...)"
        tokens = []
        if desc:
            parts = desc.split("tokens: ")
            if len(parts) > 1:
                for tok_str in parts[1].split(", "):
                    # Extract address from "NAME (ADDR...)" format
                    if "(" in tok_str and ")" in tok_str:
                        addr_part = tok_str.split("(")[1].rstrip(")")
                        addr_part = addr_part.rstrip(".")
                        if len(addr_part) >= 8:
                            tokens.append(addr_part)

        results.append(
            {
                "wallet": wallet,
                "token_count": count,
                "token_addresses": tokens,
                "description": desc or "",
            }
        )

    conn.close()
    return results


def enrich_wallet(w: dict) -> dict:
    """Enrich a single creator wallet."""
    w["wallet"]

    # SOL balance
    sol = get_sol_balance(w["wallet"])
    w["sol_balance"] = sol
    w["sol_balance_usd"] = sol * 150  # rough SOL price

    # Check token performance (enrich first 3 tokens)
    best_mcap = 0
    bonded_count = 0
    total_holders = 0

    for addr in w["token_addresses"][:3]:
        info = get_token_info(addr)
        if info:
            mcap = info.get("market_cap", 0) or 0
            if mcap > best_mcap:
                best_mcap = mcap
            if info.get("is_bonded"):
                bonded_count += 1
            total_holders += info.get("holder_count", 0)
        time.sleep(0.5)

    w["best_token_mcap"] = best_mcap
    w["bonded_tokens"] = bonded_count
    w["total_holders"] = total_holders

    # Score
    score = 0.0
    tc = w["token_count"]
    if tc >= 10:
        score += 30
    elif tc >= 5:
        score += 25
    elif tc >= 3:
        score += 20
    elif tc >= 2:
        score += 15
    else:
        score += 10

    if sol > 10:
        score += 20
    elif sol > 1:
        score += 15
    elif sol > 0.1:
        score += 10
    else:
        score += 5

    if bonded_count > 0:
        score += 15 * bonded_count
    if best_mcap > 1000000:
        score += 20
    elif best_mcap > 100000:
        score += 15
    elif best_mcap > 10000:
        score += 10

    w["score"] = round(min(100, score), 1)
    return w


def main():
    print("=== PumpFun Creator Wallet Enrichment v2 ===\n")

    creators = fetch_creators_with_tokens()
    print(f"Found {len(creators)} creator wallets\n")

    if not creators:
        return

    enriched = []
    batch = creators[:25]

    for i, w in enumerate(batch):
        print(f"[{i+1}/{len(batch)}] {w['wallet'][:16]}... ({w['token_count']} tokens)")
        enriched.append(enrich_wallet(w))
        e = enriched[-1]
        print(
            f"  SOL={e['sol_balance']:.2f}  bonded={e.get('bonded_tokens',0)}  "
            f"best_mcap=${e.get('best_token_mcap',0):,.0f}  score={e['score']}"
        )
        time.sleep(0.3)

    enriched.sort(key=lambda x: -x["score"])

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(enriched, indent=2))

    print(f"\n{'='*90}")
    print(f"{'Rank':>4} {'Wallet':>22} {'Tkns':>4} {'SOL':>7} {'Bonded':>6} {'BestMcap':>10} {'Score':>6}")
    print(f"{'-'*4} {'-'*22} {'-'*4} {'-'*7} {'-'*6} {'-'*10} {'-'*6}")
    for i, w in enumerate(enriched[:15], 1):
        print(
            f"{i:>4} {w['wallet'][:22]:>22} {w['token_count']:>4} {w['sol_balance']:>7.2f} "
            f"{w.get('bonded_tokens',0):>6} ${w.get('best_token_mcap',0):>9,.0f} {w['score']:>6.1f}"
        )

    print(f"\nSaved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
