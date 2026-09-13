#!/usr/bin/env python3
"""
GMGN Pump Alerts & Featured Signals Harvester

Harvests contract addresses from:
  1. GMGN Trenches (pump alerts: new_creation, near_completion, completed)
  2. GMGN Trending (featured signals by volume/swaps/price)

Inserts into telegram_contracts_unique in central_contracts.db
(same table as Telegram CA harvesting — unified pipeline).
"""

import json
import os
import sqlite3
import subprocess
import time
from pathlib import Path
from typing import List, Dict, Optional

from hermes_screener.config import settings
from hermes_screener.contract_db import open_sqlite_rw
from hermes_screener.utils import gmgn_cmd  # noqa: F401 – re-exported for callers

# ── Config ──────────────────────────────────────────────────────────────────
DATA_DIR = Path.home() / ".hermes" / "data"
DB_PATH = DATA_DIR / "central_contracts.db"
GMGN_CLI = str(Path.home() / ".hermes" / "scripts" / "gmgn-cli")
GMGN_API_KEY = os.environ.get("GMGN_API_KEY", "")

CHAINS = ["sol", "base", "eth", "bsc"]  # GMGN multi-chain
TRENCH_LIMIT = 30  # per category per chain
TRENDING_LIMIT = 30  # per interval per chain
TRENDING_INTERVALS = ["5m", "1h"]
TRENCH_FILTERS = ["smart-money", "safe"]


def gmgn_cmd(args: list) -> Optional[dict]:
    """Run gmgn-cli and return parsed JSON."""
    try:
        env = {**os.environ}
        if GMGN_API_KEY:
            env["GMGN_API_KEY"] = GMGN_API_KEY
        result = subprocess.run(
            ["node", GMGN_CLI] + args,
            capture_output=True,
            text=True,
            timeout=30,
            env=env,
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout.strip())
    except Exception as e:
        print(f"  gmgn-cli error: {e}")
    return None


def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def upsert_contract(conn, chain: str, address: str, source: str, channel_id: str, message_text: str = ""):
    """Insert or update a contract in telegram_contracts_unique."""
    now = time.time()
    try:
        conn.execute(
            """
            INSERT INTO telegram_contract_calls
            (channel_id, message_id, chain, contract_address, raw_address, address_source,
             message_text, observed_at, session_source, inserted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                channel_id,
                0,
                chain,
                address,
                address,
                source,
                message_text,
                now,
                "gmgn_harvester",
                now,
            ),
        )
    except sqlite3.IntegrityError:
        pass  # duplicate (message_id, contract_address)

    conn.execute(
        """
        INSERT INTO telegram_contracts_unique (chain, contract_address, first_seen_at, last_seen_at,
            mentions, last_channel_id, last_message_id, last_raw_address, last_source, last_message_text,
            channel_count, channels_seen)
        VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?, ?, 1, ?)
        ON CONFLICT(chain, contract_address) DO UPDATE SET
            last_seen_at = excluded.last_seen_at,
            mentions = mentions + 1,
            last_source = excluded.last_source,
            last_message_text = excluded.last_message_text
    """,
        (
            chain,
            address,
            now,
            now,
            channel_id,
            address,
            source,
            message_text,
            json.dumps([channel_id]),
        ),
    )


def harvest_trenches(chain: str) -> list[dict]:
    """Harvest pump alerts from GMGN trenches."""
    tokens = []

    for preset in TRENCH_FILTERS:
        data = gmgn_cmd(
            [
                "market",
                "trenches",
                "--chain",
                chain,
                "--type",
                "new_creation",
                "near_completion",
                "--limit",
                str(TRENCH_LIMIT),
                "--filter-preset",
                preset,
                "--sort-by",
                "smart_degen_count",
            ]
        )

        if not data:
            continue

        for category in ["new_creation", "near_completion", "completed"]:
            for tok in data.get(category, []):
                addr = tok.get("address", "")
                if not addr:
                    continue
                tokens.append(
                    {
                        "address": addr,
                        "chain": chain,
                        "name": tok.get("name", ""),
                        "source": f"gmgn_trenches_{preset}",
                        "smart_degen_count": tok.get("smart_degen_count", 0),
                        "liquidity": tok.get("liquidity", 0),
                        "market_cap": tok.get("market_cap", 0),
                        "holder_count": tok.get("holder_count", 0),
                        "launchpad": tok.get("launchpad", ""),
                        "fund_from": tok.get("fund_from", ""),
                        "has_social": tok.get("has_at_least_one_social", False),
                        "is_honeypot": tok.get("is_honeypot", ""),
                    }
                )

        time.sleep(1)  # rate limit

    return tokens


def harvest_trending(chain: str) -> list[dict]:
    """Harvest featured signals from GMGN trending."""
    tokens = []

    for interval in TRENDING_INTERVALS:
        data = gmgn_cmd(
            [
                "market",
                "trending",
                "--chain",
                chain,
                "--interval",
                interval,
                "--limit",
                str(TRENDING_LIMIT),
                "--order-by",
                "volume",
                "--filter",
                "renounced",
                "has_social",
                "not_wash_trading",
            ]
        )

        if not data or not data.get("data"):
            continue

        for tok in data["data"].get("rank", []):
            addr = tok.get("address", "")
            if not addr:
                continue
            tokens.append(
                {
                    "address": addr,
                    "chain": chain,
                    "name": tok.get("name", ""),
                    "symbol": tok.get("symbol", ""),
                    "source": f"gmgn_trending_{interval}",
                    "volume": tok.get("volume", 0),
                    "liquidity": tok.get("liquidity", 0),
                    "market_cap": tok.get("market_cap", 0),
                    "holder_count": tok.get("holder_count", 0),
                    "price_change": tok.get("price_change_percent", 0),
                }
            )

        time.sleep(1)

    return tokens


def main():
    print("=== GMGN Harvester ===")
    print(f"Chains: {CHAINS}")
    print()

    conn = get_db()
    total_seen = 0

    for chain in CHAINS:
        # Trenches (pump alerts)
        print(f"[{chain}] Harvesting trenches (pump alerts)...")
        trench_tokens = harvest_trenches(chain)
        for tok in trench_tokens:
            msg = f"{tok['name']} | smart_degen={tok.get('smart_degen_count',0)} | liq={tok.get('liquidity',0):.0f} | mcap={tok.get('market_cap',0):.0f}"
            upsert_contract(
                conn,
                chain,
                tok["address"],
                tok["source"],
                f"gmgn_trenches_{chain}",
                msg,
            )
            total_seen += 1

        print(f"  -> {len(trench_tokens)} tokens from trenches")

        # Trending (featured signals)
        print(f"[{chain}] Harvesting trending (featured signals)...")
        trending_tokens = harvest_trending(chain)
        for tok in trending_tokens:
            msg = f"{tok.get('symbol', tok['name'])} | vol={tok.get('volume',0):.0f} | liq={tok.get('liquidity',0):.0f} | chg={tok.get('price_change',0):.1f}%"
            upsert_contract(
                conn,
                chain,
                tok["address"],
                tok["source"],
                f"gmgn_trending_{chain}",
                msg,
            )
            total_seen += 1

        print(f"  -> {len(trending_tokens)} tokens from trending")

    conn.commit()

    # Stats
    gmgn_count = conn.execute(
        "SELECT COUNT(*) FROM telegram_contracts_unique WHERE last_source LIKE 'gmgn_%'"
    ).fetchone()[0]
    total_count = conn.execute("SELECT COUNT(*) FROM telegram_contracts_unique").fetchone()[0]

    print(f"\nDone: {total_seen} tokens processed this run")
    print(f"DB: {gmgn_count} GMGN-sourced / {total_count} total contracts")

    conn.close()


if __name__ == "__main__":
    main()
