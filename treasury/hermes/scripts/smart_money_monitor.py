#!/usr/bin/env python3
"""
Smart Money Purchase Monitor

Tracks purchases by top wallets from the wallet_tracker database.
Logs new entries to smart_money_purchases table, then feeds into
the enrichment pipeline for scoring.

Feedback loop:
  Top Wallets → Monitor Purchases → Enrich Tokens → Score
       ↑                                              ↓
       ← Discover New Wallets from Top Tokens ←───────

Usage:
  python3 smart_money_monitor.py              # normal run
  python3 smart_money_monitor.py --chain sol   # Solana only
  python3 smart_money_monitor.py --chain base  # Base only
  python3 smart_money_monitor.py --limit 200   # more results
"""

import json
import sqlite3
import time

from hermes_screener.config import settings
from hermes_screener.utils import gmgn_cmd  # noqa: F401 – shared helper

# ── Config ──────────────────────────────────────────────────────────────────
DATA_DIR = settings.db_path.parent
WALLETS_DB = settings.wallets_db_path
CONTRACTS_DB = settings.db_path
GMGN_CLI = str(settings.gmgn_cli)

CHAINS = ["sol", "base", "bsc"]
SMART_MONEY_LIMIT = 100  # per chain per run
MIN_WALLET_SCORE = 40  # only track wallets with score >= this


# gmgn_cmd is imported from hermes_screener.utils


def get_wallets_db():
    conn = sqlite3.connect(str(WALLETS_DB), timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def get_tracked_wallets(conn) -> set[str]:
    """Get set of wallet addresses we're tracking.

    Uses a component-weighted score prioritizing PnL + timing + winrate
    over aggregate wallet_score for smarter filtering.
    """
    rows = conn.execute(
        """
        SELECT address,
            COALESCE(pnl_score, 0) as pnl,
            COALESCE(entry_timing_score, 0) as timing,
            COALESCE(winrate_score, 0) as winrate,
            COALESCE(insider_score, 0) as insider,
            COALESCE(trades_score, 0) as trades,
            COALESCE(roi_score, 0) as roi,
            COALESCE(tag_score, 0) as tag,
            COALESCE(copy_penalty, 0) as copy_pen,
            COALESCE(rug_penalty, 0) as rug_pen,
            wallet_score
        FROM tracked_wallets
        WHERE wallet_score >= ?
        """,
        (MIN_WALLET_SCORE,),
    ).fetchall()

    tracked = set()
    for row in rows:
        addr, pnl, timing, winrate, insider, trades, roi, tag, copy_pen, rug_pen, agg = row
        # Component-weighted score: PnL + timing + winrate matter most
        comp_score = (
            pnl * 1.0
            + timing * 1.0
            + winrate * 0.8
            + insider * 0.7
            + trades * 0.5
            + roi * 0.4
            + tag * 0.3
            + copy_pen * 1.0
            + rug_pen * 2.0
        )
        # Require either strong aggregate or strong fundamentals
        if agg >= MIN_WALLET_SCORE or comp_score >= 35:
            tracked.add(addr)
    return tracked


def ensure_purchases_table(conn):
    """Create smart_money_purchases table if it doesn't exist."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS smart_money_purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tx_hash TEXT NOT NULL,
            wallet_address TEXT NOT NULL,
            chain TEXT NOT NULL,
            token_address TEXT NOT NULL,
            token_symbol TEXT,
            side TEXT NOT NULL,
            amount_usd REAL,
            price_usd REAL,
            timestamp INTEGER NOT NULL,
            wallet_score REAL,
            wallet_tags TEXT,
            enriched INTEGER DEFAULT 0,
            score REAL DEFAULT 0,
            inserted_at REAL NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_tx_token
            ON smart_money_purchases(tx_hash, token_address);
        CREATE INDEX IF NOT EXISTS idx_purchases_wallet
            ON smart_money_purchases(wallet_address);
        CREATE INDEX IF NOT EXISTS idx_purchases_token
            ON smart_money_purchases(token_address);
        CREATE INDEX IF NOT EXISTS idx_purchases_timestamp
            ON smart_money_purchases(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_purchases_chain
            ON smart_money_purchases(chain);

        CREATE TABLE IF NOT EXISTS smart_money_tokens (
            token_address TEXT NOT NULL,
            chain TEXT NOT NULL,
            symbol TEXT,
            first_seen_at REAL NOT NULL,
            last_seen_at REAL NOT NULL,
            buyer_count INTEGER DEFAULT 0,
            total_buy_usd REAL DEFAULT 0,
            avg_buy_usd REAL DEFAULT 0,
            top_buyer_score REAL DEFAULT 0,
            discovery_wallets TEXT DEFAULT '[]',
            enriched INTEGER DEFAULT 0,
            score REAL DEFAULT 0,
            PRIMARY KEY (chain, token_address)
        );
    """
    )
    conn.commit()


def poll_smart_money_trades(chain: str, limit: int) -> list[dict]:
    """Poll GMGN for recent smart money trades on a chain."""
    data = gmgn_cmd(["track", "smartmoney", "--chain", chain, "--limit", str(limit), "--raw"])

    if not data:
        return []

    items = data.get("list", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
    trades = []
    for item in items:
        trades.append(
            {
                "tx_hash": item.get("transaction_hash", ""),
                "wallet": item.get("maker", ""),
                "chain": chain,
                "token_address": item.get("base_address", ""),
                "token_symbol": item.get("base_token", {}).get("symbol", ""),
                "side": item.get("side", ""),
                "amount_usd": item.get("amount_usd", 0),
                "price_usd": item.get("price_usd", 0),
                "timestamp": item.get("timestamp", 0),
                "tags": item.get("maker_info", {}).get("tags", []),
            }
        )
    return trades


def process_trades(conn, trades: list[dict], tracked: set[str], chain: str):
    """Insert new purchases and update smart_money_tokens summary."""
    now = time.time()
    new_count = 0
    tracked_buy_count = 0
    new_tokens = set()

    # Load wallet scores for enrichment
    wallet_scores = {}
    for row in conn.execute("SELECT address, wallet_score, wallet_tags FROM tracked_wallets").fetchall():
        wallet_scores[row[0]] = {"score": row[1], "tags": row[2]}

    for trade in trades:
        wallet = trade["wallet"]
        token = trade["token_address"]
        side = trade["side"]
        tx = trade["tx_hash"]

        if not wallet or not token or not tx:
            continue

        # Insert purchase event
        ws = wallet_scores.get(wallet, {})
        try:
            conn.execute(
                """
                INSERT INTO smart_money_purchases
                    (tx_hash, wallet_address, chain, token_address, token_symbol,
                     side, amount_usd, price_usd, timestamp,
                     wallet_score, wallet_tags, inserted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    tx,
                    wallet,
                    chain,
                    token,
                    trade["token_symbol"],
                    side,
                    trade["amount_usd"],
                    trade["price_usd"],
                    trade["timestamp"],
                    ws.get("score"),
                    ws.get("tags"),
                    now,
                ),
            )
            new_count += 1

            # Track all buys for token discovery (not just tracked wallets)
            if side == "buy":
                new_tokens.add(token)
                # Count tracked wallet buys separately
                if wallet in tracked and (ws.get("score") or 0) >= MIN_WALLET_SCORE:
                    tracked_buy_count += 1
        except sqlite3.IntegrityError:
            pass  # duplicate

    conn.commit()

    # Update smart_money_tokens summary for new buys by tracked wallets
    for token_addr in new_tokens:
        buys = conn.execute(
            """
            SELECT COUNT(DISTINCT wallet_address), SUM(amount_usd), AVG(amount_usd),
                   MAX(COALESCE(wallet_score, 0)), GROUP_CONCAT(DISTINCT wallet_address)
            FROM smart_money_purchases
            WHERE token_address = ? AND side = 'buy' AND chain = ?
        """,
            (token_addr, chain),
        ).fetchone()

        if buys and buys[0]:
            # Get token symbol
            sym_row = conn.execute(
                "SELECT token_symbol FROM smart_money_purchases WHERE token_address = ? LIMIT 1",
                (token_addr,),
            ).fetchone()
            symbol = sym_row[0] if sym_row else ""

            conn.execute(
                """
                INSERT INTO smart_money_tokens
                    (token_address, chain, symbol, first_seen_at, last_seen_at,
                     buyer_count, total_buy_usd, avg_buy_usd, top_buyer_score,
                     discovery_wallets)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(chain, token_address) DO UPDATE SET
                    last_seen_at = excluded.last_seen_at,
                    buyer_count = excluded.buyer_count,
                    total_buy_usd = excluded.total_buy_usd,
                    avg_buy_usd = excluded.avg_buy_usd,
                    top_buyer_score = excluded.top_buyer_score,
                    discovery_wallets = excluded.discovery_wallets
            """,
                (
                    token_addr,
                    chain,
                    symbol,
                    now,
                    now,
                    buys[0],
                    buys[1] or 0,
                    buys[2] or 0,
                    buys[3] or 0,
                    buys[4] or "",
                ),
            )
        conn.commit()

    return new_count, tracked_buy_count, len(new_tokens)


def upsert_to_contracts_db(chain: str, token_addr: str, symbol: str, source: str):
    """Insert discovered tokens into central_contracts.db for enrichment."""
    if not CONTRACTS_DB.exists():
        return

    conn = sqlite3.connect(str(CONTRACTS_DB), timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    now = time.time()
    try:
        conn.execute(
            """
            INSERT INTO telegram_contracts_unique
                (chain, contract_address, first_seen_at, last_seen_at, mentions,
                 last_channel_id, last_message_id, last_raw_address, last_source,
                 last_message_text, channel_count, channels_seen)
            VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?, ?, 1, ?)
            ON CONFLICT(chain, contract_address) DO UPDATE SET
                last_seen_at = excluded.last_seen_at,
                mentions = mentions + 1,
                last_source = excluded.last_source
        """,
            (
                chain,
                token_addr,
                now,
                now,
                f"smart_money_{chain}",
                token_addr,
                source,
                f"Smart money wallet buying {symbol}",
                json.dumps([f"smart_money_{chain}"]),
            ),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        pass
    finally:
        conn.close()


def run(chain_filter: str | None = None, limit: int = SMART_MONEY_LIMIT):
    print("=" * 60)
    print("Smart Money Purchase Monitor")
    print("=" * 60)

    conn = get_wallets_db()
    ensure_purchases_table(conn)

    tracked = get_tracked_wallets(conn)
    print(f"Tracking {len(tracked)} wallets (score >= {MIN_WALLET_SCORE})")

    chains = [chain_filter] if chain_filter else CHAINS
    total_new = 0
    total_tracked_buys = 0
    total_new_tokens = 0

    for chain in chains:
        print(f"\n[{chain}] Polling smart money trades (limit={limit})...")
        trades = poll_smart_money_trades(chain, limit)
        print(f"  Got {len(trades)} trades")

        if not trades:
            continue

        # Filter to buys only for tracking
        buys = [t for t in trades if t["side"] == "buy"]
        print(f"  {len(buys)} buys, {len(trades) - len(buys)} sells")

        new, tracked_buys, new_token_count = process_trades(conn, trades, tracked, chain)
        print(f"  New purchases logged: {new}")
        print(f"  Tracked wallet buys: {tracked_buys}")
        print(f"  New tokens to enrich: {new_token_count}")

        total_new += new
        total_tracked_buys += tracked_buys
        total_new_tokens += new_token_count

        # Insert new tokens into contracts DB for enrichment pipeline
        if new_token_count > 0:
            chain_name = {"sol": "solana", "base": "base", "bsc": "bsc"}.get(chain, chain)
            recent_tokens = conn.execute(
                """
                SELECT DISTINCT token_address, token_symbol
                FROM smart_money_purchases
                WHERE chain = ? AND side = 'buy'
                  AND inserted_at > ?
                ORDER BY inserted_at DESC
            """,
                (chain, time.time() - 300),
            ).fetchall()

            for token_addr, symbol in recent_tokens:
                upsert_to_contracts_db(chain_name, token_addr, symbol or "", f"smart_money_buy_{chain}")
            print(f"  Inserted {len(recent_tokens)} tokens into contracts DB for enrichment")

    conn.close()

    print(f"\n{'=' * 60}")
    print(f"Summary: {total_new} new purchases, {total_tracked_buys} by tracked wallets, {total_new_tokens} new tokens")
    print(f"{'=' * 60}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Smart Money Purchase Monitor")
    parser.add_argument("--chain", type=str, default=None, help="Chain: sol / base / bsc")
    parser.add_argument("--limit", type=int, default=SMART_MONEY_LIMIT, help="Trades per chain")
    args = parser.parse_args()
    run(args.chain, args.limit)


if __name__ == "__main__":
    main()
