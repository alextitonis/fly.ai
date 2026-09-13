#!/usr/bin/env python3
"""
Mobula Wallet Enricher

Adds trader classification to wallets via Mobula API.
Mobula classifies wallets based on on-chain behavior:
  - whale, active_trader, swing_trader, hodler, sniper, etc.

Requires: MOBULA_API_KEY in environment or ~/.hermes/.env
Sign up: https://admin.mobula.io

Usage:
  python3 mobula_wallet_enricher.py --enrich        # enrich top 50 wallets
  python3 mobula_wallet_enricher.py --wallet ADDR   # enrich single wallet
  python3 mobula_wallet_enricher.py --test           # test API key
"""

import json
import os
import sqlite3
import time
import urllib.request
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config
from pathlib import Path

DATA_DIR = Path.home() / ".hermes" / "data"
DB_PATH = DATA_DIR / "central_contracts.db"
WALLETS_DB = DATA_DIR / "wallet_tracker.db"
MOBULA_BASE = "https://api.mobula.io/api/1"
RATE_LIMIT_DELAY = 1.0  # seconds between calls


# Load API key from env or .env file
def _load_key() -> str:
    key = os.environ.get("MOBULA_API_KEY", "")
    if key:
        return key
    env_file = Path.home() / ".hermes" / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("MOBULA_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


MOBULA_KEY = _load_key()


def mobula_request(endpoint: str, params: dict = None) -> dict | None:
    """Make authenticated request to Mobula API."""
    if not MOBULA_KEY:
        print("  MOBULA_API_KEY not set. Get one at https://admin.mobula.io")
        return None

    url = f"{MOBULA_BASE}/{endpoint}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url += f"?{qs}"

    try:
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": MOBULA_KEY,
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"  Mobula {e.code}: {body[:100]}")
        return None
    except Exception as e:
        print(f"  Mobula error: {e}")
        return None


def get_wallet_classification(wallet: str, blockchain: str = "solana") -> dict:
    """
    Get trader classification from Mobula.

    Returns dict with:
      - trader_type: whale/active_trader/swing_trader/hodler/etc
      - tags: list of classification tags
      - pnl_30d: 30-day PnL
      - win_rate: trading win rate
      - trade_count: number of trades
    """
    result = {}

    # Portfolio endpoint gives trader classification
    data = mobula_request(
        "wallet/portfolio",
        {
            "wallet": wallet,
            "blockchain": blockchain,
        },
    )

    if not data:
        return result

    # Extract trader classification from response
    wallet_data = data.get("data", data)

    # Mobula returns trader_type/classification in various formats
    trader_type = (
        wallet_data.get("trader_type") or wallet_data.get("classification") or wallet_data.get("wallet_type", "")
    )
    if trader_type:
        result["mobula_trader_type"] = trader_type

    # Tags from Mobula analysis
    tags = wallet_data.get("tags", [])
    if tags:
        result["mobula_tags"] = tags

    # PnL metrics
    pnl = wallet_data.get("pnl_30d") or wallet_data.get("pnl", {})
    if isinstance(pnl, dict):
        result["mobula_pnl_30d"] = pnl.get("total", 0)
        result["mobula_win_rate"] = pnl.get("win_rate", 0)
    elif isinstance(pnl, (int, float)):
        result["mobula_pnl_30d"] = pnl

    # Trade count
    result["mobula_trade_count"] = wallet_data.get("trade_count") or wallet_data.get("total_trades", 0)

    return result


def enrich_wallets_in_db(limit: int = 50):
    """Enrich top wallets in wallet_tracker.db with Mobula data."""
    if not WALLETS_DB.exists():
        print(f"  {WALLETS_DB} not found")
        return

    db = sqlite3.connect(str(WALLETS_DB))
    db.row_factory = sqlite3.Row

    rows = db.execute(
        """
        SELECT address, chain, wallet_score, wallet_tags
        FROM tracked_wallets
        WHERE wallet_score > 0
        ORDER BY wallet_score DESC
        LIMIT ?
    """,
        (limit,),
    ).fetchall()

    print(f"Enriching {len(rows)} wallets with Mobula...")
    enriched = 0

    for row in rows:
        wallet = row["address"]
        chain = row["chain"] or "solana"
        existing_tags = row["wallet_tags"] or ""

        print(f"  [{enriched+1}/{len(rows)}] {wallet[:16]}...", end=" ")
        time.sleep(RATE_LIMIT_DELAY)

        mobula = get_wallet_classification(wallet, chain)
        if not mobula:
            print("no data")
            continue

        # Merge Mobula tags into existing wallet_tags
        new_tags = set(t.strip() for t in existing_tags.split(",") if t.strip())

        trader_type = mobula.get("mobula_trader_type", "")
        if trader_type:
            new_tags.add(f"mobula:{trader_type}")

        for tag in mobula.get("mobula_tags", []):
            new_tags.add(f"mobula:{tag}")

        merged_tags = ",".join(sorted(new_tags))

        # Update DB
        db.execute(
            """
            UPDATE tracked_wallets
            SET wallet_tags = ?
            WHERE address = ?
        """,
            (merged_tags, wallet),
        )

        enriched += 1
        print(f"tags={trader_type or '-'} {mobula.get('mobula_tags', [])}")

    db.commit()
    db.close()
    print(f"\nEnriched {enriched}/{len(rows)} wallets")


def test_api():
    """Test if Mobula API key works."""
    print(f"API key: {'*' * 8}{MOBULA_KEY[-4:] if len(MOBULA_KEY) > 4 else 'NOT SET'}")

    data = mobula_request("market/multi-data", {"assets": "bitcoin,ethereum"})
    if data:
        print(f"API working! Response keys: {list(data.keys())[:5]}")
        return True
    else:
        print("API not working. Check your key at https://admin.mobula.io")
        return False


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Mobula Wallet Enricher")
    parser.add_argument("--enrich", action="store_true", help="Enrich top wallets")
    parser.add_argument("--wallet", help="Enrich single wallet")
    parser.add_argument("--test", action="store_true", help="Test API key")
    parser.add_argument("--limit", type=int, default=50, help="Max wallets to enrich")
    args = parser.parse_args()

    if args.test:
        test_api()
        return

    if args.wallet:
        result = get_wallet_classification(args.wallet)
        print(json.dumps(result, indent=2))
        return

    if args.enrich:
        enrich_wallets_in_db(limit=args.limit)
        return

    parser.print_help()


if __name__ == "__main__":
    main()
