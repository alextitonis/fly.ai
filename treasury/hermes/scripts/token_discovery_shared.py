"""Shared helpers for legacy token discovery scripts.

These utilities are intentionally simple wrappers so older scripts can share
the same DexScreener lookup and discovered_tokens table handling.
"""

from __future__ import annotations

import sqlite3
from typing import Any

import requests
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config

DISCOVERED_TOKENS_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS discovered_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    token_name TEXT,
    token_address TEXT,
    chain TEXT,
    dex TEXT,
    price REAL,
    liquidity REAL,
    volume_24h REAL,
    source TEXT,
    discovery_method TEXT
)
"""


def lookup_token_address(token_name: str) -> dict[str, Any]:
    """Resolve token metadata from DexScreener search endpoint."""
    result: dict[str, Any] = {
        "name": token_name,
        "address": None,
        "chain": "solana",
        "source": None,
        "price": None,
        "liquidity": None,
        "volume": None,
        "dex": None,
    }

    try:
        url = f"https://api.dexscreener.com/latest/dex/search?q={token_name}"
        response = requests.get(url, timeout=10)

        if response.status_code == 200:
            data = response.json()
            pairs = data.get("pairs") or []
            for pair in pairs[:3]:
                base_token = pair.get("baseToken") or {}
                token_name_lc = token_name.lower()
                if (
                    base_token.get("name", "").lower() == token_name_lc
                    or base_token.get("symbol", "").lower() == token_name_lc
                ):
                    result["address"] = base_token.get("address")
                    result["chain"] = pair.get("chainId", "solana")
                    result["source"] = "dexscreener"
                    result["dex"] = pair.get("dexId", "")
                    result["price"] = pair.get("priceUsd", "")
                    result["liquidity"] = pair.get("liquidity", {}).get("usd", "")
                    result["volume"] = pair.get("volume", {}).get("h24", "")
                    break
    except Exception as exc:
        print(f"Error with DexScreener API for {token_name}: {exc}")

    return result


def ensure_discovered_tokens_table(conn: sqlite3.Connection) -> None:
    """Create discovered_tokens table if needed."""
    conn.execute(DISCOVERED_TOKENS_SCHEMA_SQL)
    conn.commit()


def insert_discovered_token(
    conn: sqlite3.Connection,
    token_info: dict[str, Any],
    discovery_method: str = "rick_bot",
    *,
    commit: bool = True,
) -> None:
    """Insert one discovered token row."""
    conn.execute(
        """
        INSERT INTO discovered_tokens (
            token_name,
            token_address,
            chain,
            dex,
            price,
            liquidity,
            volume_24h,
            source,
            discovery_method
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (
            token_info.get("name", "unknown"),
            token_info.get("address"),
            token_info.get("chain", "solana"),
            token_info.get("dex"),
            token_info.get("price"),
            token_info.get("liquidity"),
            token_info.get("volume"),
            token_info.get("source"),
            discovery_method,
        ),
    )
    if commit:
        conn.commit()
