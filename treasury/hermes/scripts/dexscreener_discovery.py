#!/usr/bin/env python3
"""
Dexscreener Trending Discovery - Pull boosted + profile tokens from all chains.

Sources (free, no auth):
  1. Token Boosts (top promoted tokens)
  2. Token Profiles (newly listed tokens)

Inserts into central_contracts.db for enrichment pipeline.

Usage:
  python3 dexscreener_discovery.py              # all chains
  python3 dexscreener_discovery.py --chain base  # Base only
"""

import sqlite3
import time
from pathlib import Path

import requests

DATA_DIR = Path.home() / ".hermes" / "data"
DB_PATH = DATA_DIR / "central_contracts.db"

# Dexscreener chain IDs
SUPPORTED_CHAINS = [
    "solana",
    "ethereum",
    "base",
    "bsc",
    "arbitrum",
    "polygon",
    "avalanche",
    "optimism",
    "sui",
]


def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def upsert_contract(conn, chain: str, address: str, source: str, description: str = ""):
    """Insert contract into DB."""
    now = time.time()
    chan_str = f"discovery:{source}"
    try:
        msg_id = int(now * 1000) + hash(address) % 10000
        conn.execute(
            """
            INSERT INTO telegram_contract_calls
                (channel_id, message_id, chain, contract_address, raw_address,
                 address_source, message_text, observed_at, session_source, inserted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (chan_str, msg_id, chain, address, address, source, description[:500], now, "dexscreener_discovery", now),
        )

        conn.execute(
            """
            INSERT INTO telegram_contracts_unique
                (chain, contract_address, first_seen_at, last_seen_at, mentions,
                 last_channel_id, last_message_id, last_raw_address, last_source,
                 last_message_text, channel_count, channels_seen)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(chain, contract_address) DO UPDATE SET
                last_seen_at = excluded.last_seen_at,
                mentions = mentions + 1,
                last_source = excluded.last_source,
                channel_count = CASE
                    WHEN ',' || channels_seen || ',' LIKE '%,' || ? || ',%'
                    THEN channel_count ELSE channel_count + 1 END,
                channels_seen = CASE
                    WHEN channels_seen = '' OR channels_seen IS NULL THEN ?
                    WHEN ',' || channels_seen || ',' LIKE '%,' || ? || ',%'
                    THEN channels_seen ELSE channels_seen || ',' || ? END
        """,
            (
                chain,
                address,
                now,
                now,
                chan_str,
                msg_id,
                address,
                source,
                description[:500],
                chan_str,
                chan_str,
                chan_str,
                chan_str,
                chan_str,
            ),
        )
        return True
    except sqlite3.IntegrityError:
        return False


def fetch_boosted():
    """Fetch top boosted tokens from Dexscreener."""
    try:
        resp = requests.get(
            "https://api.dexscreener.com/token-boosts/top/v1",
            timeout=15,
        )
        if resp.status_code != 200:
            print(f"  Boosted API error: {resp.status_code}")
            return []
        data = resp.json()
        results = []
        for t in data:
            chain = t.get("chainId", "")
            addr = t.get("tokenAddress", "")
            if chain and addr:
                results.append((chain, addr, "dexscreener_boost", f"Boosted: {t.get('description', '')[:100]}"))
        return results
    except Exception as e:
        print(f"  Boosted error: {e}")
        return []


def fetch_profiles():
    """Fetch latest token profiles from Dexscreener."""
    try:
        resp = requests.get(
            "https://api.dexscreener.com/token-profiles/latest/v1",
            timeout=15,
        )
        if resp.status_code != 200:
            print(f"  Profiles API error: {resp.status_code}")
            return []
        data = resp.json()
        results = []
        for t in data:
            chain = t.get("chainId", "")
            addr = t.get("tokenAddress", "")
            if chain and addr:
                results.append((chain, addr, "dexscreener_profile", f"Profile: {t.get('description', '')[:100]}"))
        return results
    except Exception as e:
        print(f"  Profiles error: {e}")
        return []


def fetch_trending(chain_id: str):
    """Fetch trending tokens for a specific chain from Dexscreener search."""
    try:
        # Use search API with chain filter for trending tokens
        resp = requests.get(
            "https://api.dexscreener.com/token-boosts/top/v1",
            timeout=15,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        results = []
        for t in data:
            if t.get("chainId") == chain_id and t.get("tokenAddress"):
                results.append(
                    (
                        chain_id,
                        t["tokenAddress"],
                        f"dexscreener_trending_{chain_id}",
                        f"Trending on {chain_id}: {t.get('description', '')[:80]}",
                    )
                )
        return results
    except Exception:
        return []


def run(chain_filter=None):
    print("=" * 60)
    print("Dexscreener Trending Discovery")
    print("=" * 60)

    conn = get_db()
    total_new = 0

    # 1. Fetch boosted tokens
    print("\nFetching boosted tokens...")
    boosted = fetch_boosted()
    print(f"  Found {len(boosted)} boosted tokens")
    new = sum(1 for chain, addr, src, desc in boosted if upsert_contract(conn, chain, addr, src, desc))
    total_new += new
    print(f"  New: {new}")

    # 2. Fetch profiles
    print("\nFetching token profiles...")
    profiles = fetch_profiles()
    print(f"  Found {len(profiles)} profiles")
    new = sum(1 for chain, addr, src, desc in profiles if upsert_contract(conn, chain, addr, src, desc))
    total_new += new
    print(f"  New: {new}")

    # 3. Per-chain trending (if chain filter specified)
    if chain_filter:
        chains = [chain_filter]
    else:
        chains = SUPPORTED_CHAINS

    print(f"\nFetching trending for {len(chains)} chains...")
    for chain in chains:
        trending = fetch_trending(chain)
        new = sum(1 for c, addr, src, desc in trending if upsert_contract(conn, c, addr, src, desc))
        if new > 0:
            print(f"  {chain}: {new} new")

    conn.commit()

    # Stats
    total = conn.execute("SELECT COUNT(*) FROM telegram_contracts_unique").fetchone()[0]
    by_chain = {}
    for row in conn.execute("SELECT chain, COUNT(*) FROM telegram_contracts_unique GROUP BY chain").fetchall():
        by_chain[row[0]] = row[1]

    print(f"\n{'=' * 60}")
    print(f"Total new: {total_new}")
    print(f"DB total: {total} contracts")
    for chain, cnt in sorted(by_chain.items(), key=lambda x: -x[1]):
        print(f"  {chain:<15} {cnt:>6}")
    print(f"{'=' * 60}")

    conn.close()


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Dexscreener trending discovery")
    parser.add_argument("--chain", type=str, default=None)
    args = parser.parse_args()
    run(args.chain)


if __name__ == "__main__":
    main()
