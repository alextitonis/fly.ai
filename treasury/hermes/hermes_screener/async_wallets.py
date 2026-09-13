"""
Async wallet enrichment — parallelizes GMGN holder fetches.

Instead of sequential sort-order calls, this fires all 10 sort orders
concurrently via asyncio + subprocess, then moves to the next token.
Optionally processes multiple tokens in parallel too.

Usage:
    from hermes_screener.async_wallets import enrich_wallets_async
    result = enrich_wallets_async(conn, tokens, min_score=30)

Speedup: ~6 min sequential → ~1-2 min async (5-10x for holder fetching)
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import time
from pathlib import Path
from typing import TypedDict

JsonValue = dict[str, "JsonValue"] | list["JsonValue"] | str | int | float | bool | None


class WalletEnrichResult(TypedDict):
    tokens_scanned: int
    holders_found: int
    unique_wallets: int
    elapsed: float


from hermes_screener.config import settings  # noqa: E402
from hermes_screener.logging import get_logger  # noqa: E402
from hermes_screener.metrics import metrics  # noqa: E402

log = get_logger("async_wallets")

GMGN_CLI = str(settings.gmgn_cli)
GMGN_MAX = 100

# Sort strategies to maximize wallet coverage (profitable traders only)
SORT_ORDERS = [
    ("amount_percentage", "desc"),
    ("profit", "desc"),
    ("unrealized_profit", "desc"),
    ("buy_volume_cur", "desc"),
    ("sell_volume_cur", "desc"),
]

CHAIN_MAP = {
    "solana": "sol",
    "sol": "sol",
    "base": "base",
    "ethereum": "base",
    "eth": "base",
    "binance": "bsc",
    "bsc": "bsc",
}


async def _find_node() -> str:
    """Find node binary."""
    for c in [
        str(Path.home() / ".local" / "bin" / "node"),
        "/usr/local/bin/node",
        "/usr/bin/node",
    ]:
        try:
            proc = await asyncio.create_subprocess_exec(
                c,
                "--version",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
            if proc.returncode == 0:
                return c
        except FileNotFoundError:
            continue
    return "node"


async def _gmgn_cmd_async(args: list[str], node_bin: str) -> JsonValue:
    """Run GMGN CLI asynchronously."""
    try:
        proc = await asyncio.create_subprocess_exec(
            node_bin,
            GMGN_CLI,
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
        if proc.returncode != 0:
            return None
        return json.loads(stdout.decode())
    except Exception:
        return None


async def _fetch_holders_batch(
    node_bin: str,
    chain: str,
    address: str,
    order_by: str,
    direction: str,
) -> list[dict[str, object]]:
    """Fetch one batch of holders with a specific sort order."""
    data = await _gmgn_cmd_async(
        [
            "token",
            "holders",
            "--chain",
            chain,
            "--address",
            address,
            "--limit",
            str(GMGN_MAX),
            "--order-by",
            order_by,
            "--direction",
            direction,
            "--raw",
        ],
        node_bin,
    )
    if not data:
        return []
    return data if isinstance(data, list) else data.get("list", [])


async def _fetch_all_holders_for_token(
    node_bin: str,
    chain: str,
    address: str,
    limit: int = 1000,
) -> list[dict[str, object]]:
    """Fetch up to `limit` holders for a token using parallel sort-order calls."""
    gmgn_chain = CHAIN_MAP.get(chain.lower())
    if not gmgn_chain:
        return []

    # Fire all sort orders concurrently
    tasks = [_fetch_holders_batch(node_bin, gmgn_chain, address, ob, d) for ob, d in SORT_ORDERS]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Deduplicate by address
    seen = set()
    all_holders = []
    for batch in results:
        if isinstance(batch, Exception):
            continue
        for h in batch:  # type: ignore[union-attr]
            addr = h.get("address", "")
            if addr and addr not in seen:
                seen.add(addr)
                all_holders.append(h)
            if len(all_holders) >= limit:
                break
        if len(all_holders) >= limit:
            break

    return all_holders[:limit]


async def enrich_wallets_async(
    conn: sqlite3.Connection,
    tokens: list[dict[str, object]],
    min_token_score: float = 30,
    max_concurrent_tokens: int = 3,
    dry_run: bool = False,
) -> WalletEnrichResult:
    """
    Enrich wallets from top-scoring tokens using async parallel fetching.

    Args:
        conn: SQLite connection (wallet_tracker.db)
        tokens: List of scored tokens from top100.json
        min_token_score: Only scan tokens scoring above this
        max_concurrent_tokens: How many tokens to process in parallel
        dry_run: Don't write to DB
    """
    import sys

    sys.path.insert(0, str(settings.hermes_home / "scripts"))
    from wallet_tracker import (
        detect_copy_traders,
        detect_insiders,
        detect_rug_history,
        infer_trading_patterns,
        upgrade_wallet_db,
    )

    node_bin = await _find_node()
    log.info(
        "async_wallet_start",
        tokens=len(tokens),
        min_score=min_token_score,
        concurrency=max_concurrent_tokens,
    )

    # Filter tokens
    eligible = [t for t in tokens if (t.get("score") or 0) >= min_token_score]
    log.info(f"eligible_tokens={len(eligible)}")

    now = time.time()
    wallet_appearances: dict[str, list[dict[str, object]]] = {}
    tokens_scanned = 0
    holders_found = 0
    semaphore = asyncio.Semaphore(max_concurrent_tokens)

    async def process_token(token_info: dict) -> tuple[int, int]:
        nonlocal tokens_scanned, holders_found
        chain = token_info.get("chain", "")
        addr = token_info.get("contract_address", "")
        sym = token_info.get("symbol", "?")
        score = token_info.get("score", 0)

        async with semaphore:
            start = time.time()
            holders = await _fetch_all_holders_for_token(node_bin, chain, addr, limit=settings.holders_per_token)
            elapsed = time.time() - start

            tokens_scanned += 1
            log.info(
                "scanned",
                token=sym,
                score=score,
                wallets=len(holders),
                elapsed=round(elapsed, 1),
            )

            # Token FDV for calculating holder value
            token_fdv = token_info.get("dex", {}).get("fdv", 0) or 0

            for h in holders:
                w = h.get("address", "")
                if not w:
                    continue

                # ── $10K MINIMUM VALUE FILTER ──
                # Only track wallets holding >$10K worth of this token.
                # GMGN returns amount_percentage; approximate value from FDV.
                amount_pct = h.get("amount_percentage", 0) or 0
                value_held = 0.0
                if token_fdv and amount_pct:
                    value_held = (amount_pct / 100.0) * token_fdv
                # Fallback: use unrealized_profit as proxy if amount_percentage missing
                if value_held <= 0:
                    unrealized = h.get("unrealized_profit", 0) or 0
                    realized = h.get("realized_profit", 0) or 0
                    value_held = unrealized + realized
                if value_held < 10_000:
                    continue

                holders_found += 1
                profit = h.get("profit", 0) or 0
                entry = {
                    "chain": CHAIN_MAP.get(chain.lower(), chain.lower()),
                    "token_address": addr,
                    "token_symbol": sym,
                    "profit": profit,
                    "profit_change": h.get("profit_change", 0) or 0,
                    "realized_profit": h.get("realized_profit", 0) or 0,
                    "unrealized_profit": h.get("unrealized_profit", 0) or 0,
                    "buy_tx_count": h.get("buy_tx_count_cur", 0) or 0,
                    "sell_tx_count": h.get("sell_tx_count_cur", 0) or 0,
                    "total_trades": (h.get("buy_tx_count_cur", 0) or 0) + (h.get("sell_tx_count_cur", 0) or 0),
                    "avg_cost": h.get("avg_cost"),
                    "start_holding_at": h.get("start_holding_at"),
                    "is_profitable": 1 if profit > 0 else 0,
                }
                if w not in wallet_appearances:
                    wallet_appearances[w] = []
                wallet_appearances[w].append(entry)

            return len(holders), tokens_scanned

    # Process all tokens in parallel (bounded by semaphore)
    await asyncio.gather(*[process_token(t) for t in eligible])

    enrichment_elapsed = time.time() - now
    unique_wallets = len(wallet_appearances)
    log.info(
        "enrichment_done",
        tokens=tokens_scanned,
        holders=holders_found,
        unique=unique_wallets,
        elapsed=round(enrichment_elapsed, 1),
    )

    # Write to DB (sync)
    if not dry_run and wallet_appearances:
        cursor = conn.cursor()
        for w_addr, entries in wallet_appearances.items():
            total_profit = sum(e["profit"] for e in entries)  # type: ignore[misc]
            total_realized = sum(e["realized_profit"] for e in entries)  # type: ignore[misc]
            total_unrealized = sum(e["unrealized_profit"] for e in entries)  # type: ignore[misc]
            avg_roi = total_profit / len(entries) if entries else 0  # type: ignore[misc]
            total_trades = sum(e["total_trades"] for e in entries)  # type: ignore[misc]
            buy_count = sum(e["buy_tx_count"] for e in entries)  # type: ignore[misc]
            sell_count = sum(e["sell_tx_count"] for e in entries)  # type: ignore[misc]
            profitable = sum(e["is_profitable"] for e in entries)  # type: ignore[misc]
            win_rate = profitable / len(entries) if entries else 0  # type: ignore[misc]

            cursor.execute(
                """
                INSERT INTO tracked_wallets (address, chain, discovered_at, last_updated,
                    wallet_score, realized_pnl, unrealized_pnl,
                    total_profit, avg_roi, total_trades, buy_count, sell_count,
                    win_rate, tokens_profitable, tokens_total, first_seen_at, last_active_at)
                VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(address) DO UPDATE SET
                    last_updated=?,
                    realized_pnl=?, unrealized_pnl=?, total_profit=?, avg_roi=?,
                    total_trades=?, buy_count=?, sell_count=?,
                    win_rate=?, tokens_profitable=?, tokens_total=?, last_active_at=?
            """,
                (
                    w_addr,
                    entries[0]["chain"],
                    now,
                    now,
                    total_realized,
                    total_unrealized,
                    total_profit,
                    avg_roi,
                    total_trades,
                    buy_count,
                    sell_count,
                    win_rate,
                    profitable,
                    len(entries),
                    now,
                    now,
                    # ON CONFLICT updates
                    now,
                    total_realized,
                    total_unrealized,
                    total_profit,
                    avg_roi,
                    total_trades,
                    buy_count,
                    sell_count,
                    win_rate,
                    profitable,
                    len(entries),
                    now,
                ),
            )

            for entry in entries:
                cursor.execute(
                    """
                    INSERT OR IGNORE INTO wallet_token_entries
                    (wallet_address, chain, token_address, token_symbol, profit,
                     profit_change, realized_profit, unrealized_profit,
                     buy_tx_count, sell_tx_count, avg_cost, start_holding_at,
                     is_profitable, discovered_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        w_addr,
                        entry["chain"],
                        entry["token_address"],
                        entry["token_symbol"],
                        entry["profit"],
                        entry["profit_change"],
                        entry["realized_profit"],
                        entry["unrealized_profit"],
                        entry["buy_tx_count"],
                        entry["sell_tx_count"],
                        entry["avg_cost"],
                        entry["start_holding_at"],
                        entry["is_profitable"],
                        now,
                    ),
                )

        conn.commit()
        log.info("db_written", wallets=unique_wallets)

    # Pattern detection (sync, fast)
    log.info("running_pattern_detection")
    detect_copy_traders(conn)
    detect_insiders(conn)
    detect_rug_history(conn)
    infer_trading_patterns(conn)
    upgrade_wallet_db(conn)
    conn.commit()

    elapsed = time.time() - now
    log.info(
        "async_wallet_done",
        elapsed=round(elapsed, 1),
        tokens=tokens_scanned,
        unique_wallets=unique_wallets,
    )

    metrics.wallets_discovered.inc(unique_wallets)

    return {
        "tokens_scanned": tokens_scanned,
        "holders_found": holders_found,
        "unique_wallets": unique_wallets,
        "elapsed": round(elapsed, 1),
    }


def enrich_wallets_async_sync(
    conn: sqlite3.Connection,
    tokens: list[dict[str, object]],
    min_token_score: float = 30,
    max_concurrent_tokens: int = 3,
    dry_run: bool = False,
) -> WalletEnrichResult:
    """Synchronous wrapper for enrich_wallets_async()."""
    return asyncio.run(enrich_wallets_async(conn, tokens, min_token_score, max_concurrent_tokens, dry_run))
