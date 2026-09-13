"""Shared SQLite helpers for contract-ingestion scripts.

This module centralizes:
- SQLite connection setup (WAL + busy timeout)
- Canonical telegram_contract_* table schema used by multiple scripts
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

TELEGRAM_CONTRACT_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS telegram_contract_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    chain TEXT,
    contract_address TEXT NOT NULL,
    raw_address TEXT,
    address_source TEXT,
    message_text TEXT,
    observed_at REAL,
    session_source TEXT,
    inserted_at REAL NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calls_msg_contract
    ON telegram_contract_calls(message_id, contract_address);

CREATE TABLE IF NOT EXISTS telegram_contracts_unique (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chain TEXT NOT NULL,
    contract_address TEXT NOT NULL,
    first_seen_at REAL NOT NULL,
    last_seen_at REAL NOT NULL,
    mentions INTEGER NOT NULL,
    last_channel_id TEXT,
    last_message_id INTEGER,
    last_raw_address TEXT,
    last_source TEXT,
    last_message_text TEXT,
    channel_count INTEGER NOT NULL DEFAULT 0,
    channels_seen TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_chain_addr
    ON telegram_contracts_unique(chain, contract_address);
"""


def open_sqlite_rw(db_path: str | Path, timeout: float = 30.0) -> sqlite3.Connection:
    """Open a writable SQLite DB with shared project defaults."""
    conn = sqlite3.connect(str(db_path), timeout=timeout)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def ensure_telegram_contract_tables(conn: sqlite3.Connection, *, commit: bool = True) -> None:
    """Ensure canonical contract-ingestion tables/indexes exist."""
    conn.executescript(TELEGRAM_CONTRACT_TABLES_SQL)
    if commit:
        conn.commit()
