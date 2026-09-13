#!/usr/bin/env python3
"""
Wallet Tracker v2 - Enrich wallet data from top-scoring tokens.

Discovers and scores smart money wallets by scanning top holders across
multiple winning tokens. Cross-token presence = win rate signal.

Scoring (0-100):
  PNL (0-30), ROI (0-25), Win Rate (0-25), Entry Timing (0-10), Trade Count (0-10)

Usage:
  python3 wallet_tracker.py                    # normal run
  python3 wallet_tracker.py --min-score 30     # only enrich from tokens scoring >30
  python3 wallet_tracker.py --max-tokens 20    # limit token scans
  python3 wallet_tracker.py --dry-run          # don't write to DB
"""

import base64
import json
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

import requests

from hermes_screener.config import settings
from hermes_screener.logging import get_logger
from hermes_screener.metrics import start_metrics_server
from hermes_screener.utils import gmgn_cmd

# ── Config (from centralized settings) ───────────────────────────────────────
DB_PATH = settings.db_path
WALLETS_DB = settings.wallets_db_path
TOP_TOKENS_PATH = settings.output_path
GMGN_CLI = str(settings.gmgn_cli)
GMGN_API_KEY = settings.gmgn_api_key
HOLDERS_PER_TOKEN = settings.holders_per_token
CHAIN_MAP = {
    "solana": "sol",
    "sol": "sol",
    "base": "base",
    "ethereum": "base",
    "eth": "base",
    "binance": "bsc",
    "bsc": "bsc",
}

# ── Logging + Metrics ────────────────────────────────────────────────────────
log = get_logger("wallet_tracker")
start_metrics_server()

# ── GMGN CLI (node resolution) ─────────────────────────────────────────────
# find_node and gmgn_cmd are imported from hermes_screener.utils


# ── Database ────────────────────────────────────────────────────────────────


def init_wallet_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(WALLETS_DB), timeout=30)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS tracked_wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            address TEXT NOT NULL,
            chain TEXT NOT NULL,
            discovered_at REAL NOT NULL,
            last_updated REAL,

            -- Scoring
            wallet_score REAL DEFAULT 0,

            -- Component scores (individual attribute scores for prioritization)
            pnl_score REAL DEFAULT 0,
            trades_score REAL DEFAULT 0,
            winrate_score REAL DEFAULT 0,
            roi_score REAL DEFAULT 0,
            timing_score REAL DEFAULT 0,
            age_score REAL DEFAULT 0,
            tag_score REAL DEFAULT 0,
            insider_score REAL DEFAULT 0,
            defi_score REAL DEFAULT 0,
            social_score REAL DEFAULT 0,
            round_trip_penalty REAL DEFAULT 0,
            copy_penalty REAL DEFAULT 0,
            rug_penalty REAL DEFAULT 0,
            low_win_penalty REAL DEFAULT 0,

            -- Per-token metrics (from GMGN token holders)
            realized_pnl REAL,
            unrealized_pnl REAL,
            total_profit REAL,
            avg_roi REAL,
            total_trades INTEGER,
            buy_count INTEGER,
            sell_count INTEGER,
            avg_cost REAL,
            entry_timing_score REAL,

            -- Cross-token metrics
            win_rate REAL,
            tokens_profitable INTEGER DEFAULT 0,
            tokens_total INTEGER DEFAULT 0,

            -- Social
            smart_money_tag TEXT,
            wallet_tags TEXT,
            twitter_username TEXT,

            -- Activity
            first_seen_at REAL,
            last_active_at REAL,

            -- Pattern detection
            copy_trade_flag INTEGER DEFAULT 0,
            insider_flag INTEGER DEFAULT 0,
            rug_history_count INTEGER DEFAULT 0,
            trading_pattern TEXT,
            avg_hold_hours REAL,

            -- Zerion supplement
            zerion_value REAL,
            zerion_24h_change_pct REAL,
            zerion_defi_value REAL,

            UNIQUE(chain, address)
        );

        CREATE TABLE IF NOT EXISTS wallet_token_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT NOT NULL,
            chain TEXT NOT NULL,
            token_address TEXT NOT NULL,
            token_symbol TEXT,

            -- Per-token data from GMGN
            profit REAL,
            profit_change REAL,
            realized_profit REAL,
            unrealized_profit REAL,
            buy_tx_count INTEGER,
            sell_tx_count INTEGER,
            avg_cost REAL,
            start_holding_at REAL,
            end_holding_at REAL,
            is_profitable INTEGER,

            discovered_at REAL NOT NULL,

            UNIQUE(wallet_address, token_address)
        );

        CREATE TABLE IF NOT EXISTS wallet_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT NOT NULL,
            chain TEXT NOT NULL,
            token_address TEXT NOT NULL,
            token_symbol TEXT,
            alert_type TEXT,
            details TEXT,
            created_at REAL NOT NULL,
            notified INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_wallets_score ON tracked_wallets(wallet_score DESC);
        CREATE INDEX IF NOT EXISTS idx_wallets_winrate ON tracked_wallets(win_rate DESC);
        CREATE INDEX IF NOT EXISTS idx_entries_wallet ON wallet_token_entries(wallet_address);
        CREATE INDEX IF NOT EXISTS idx_entries_token ON wallet_token_entries(token_address);

        -- Migration: add component score columns if they don't exist
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS pnl_score REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS trades_score REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS winrate_score REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS roi_score REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS timing_score REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS age_score REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS tag_score REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS insider_score REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS defi_score REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS social_score REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS round_trip_penalty REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS copy_penalty REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS rug_penalty REAL DEFAULT 0;
        ALTER TABLE tracked_wallets ADD COLUMN IF NOT EXISTS low_win_penalty REAL DEFAULT 0;
    """
    )
    conn.commit()
    return conn


# ── Wallet Scoring ──────────────────────────────────────────────────────────


# ══════════════════════════════════════════════════════════════════════════════
# WALLET SCORING v3 — Smart Money Prioritization
# ══════════════════════════════════════════════════════════════════════════════
#
# Philosophy: The BEST wallets are ones that:
#   1. Enter tokens EARLY (before call channels catch them)
#   2. Take PROFIT (not just paper gains)
#   3. Have HIGH win rate across many tokens
#   4. Are tagged as smart money by GMGN
#   5. Have DeFi sophistication (staked/borrowed = serious player)
#   6. Are INSIDERS (they know things we don't)
#   7. Exit cleanly (no "round trips" of profit without selling)
#   8. Never rugged anyone
#
# Scoring: 0-100, higher = smarter money to follow


def score_wallet_v3(
    # Core financial
    realized_pnl: float,  # total profit taken across all tokens
    total_profit: float,  # realized + unrealized
    avg_roi: float,  # avg profit_change multiplier (6.6x = 660%)
    win_rate: float,  # profitable tokens / total tokens
    total_trades: int,  # buy + sell across all tokens
    # Entry quality
    entry_timing_score: float,  # 0=at launch=best, 1=late
    # Social proof
    smart_money_tag: str,  # TOP1, SMART, DEGEN, etc.
    wallet_tags: str,  # comma-separated tags
    # Pattern flags
    insider_flag: int,  # 1 = insider (good - they know things)
    copy_trade_flag: int,  # 1 = copy trader (bad - always late)
    rug_history_count: int,  # count of rugged tokens (terrible)
    trading_pattern="",  # placeholder for future pattern inference
    tokens_profitable: int = 0,  # tokens with positive PnL
    tokens_total: int = 0,  # total tokens scanned
    # DeFi sophistication (from Zerion)
    zerion_value: float = 0,  # current portfolio value
    defi_value: float = 0,  # staked + borrowed positions
    # Round trips (profit taken without selling = bad)
    round_trip_count: int = 0,  # tokens where profit > 0 but sell_count = 0
    # Wallet age
    wallet_age_days: float = 0,  # how long wallet has existed (longer = better)
    # Social presence
    twitter_username: str = "",  # linked Twitter = more credible
) -> dict:

    score = 0.0
    components: dict[str, float] = {}

    # ═════════════════════════════════════════════════════════════════════
    # PRIMARY SIGNALS (heavily weighted — these matter most)
    # ═════════════════════════════════════════════════════════════════════

    # ─────────────────────────────────────────────────────────────────────
    # 1. REALIZED PNL (0-35) — the #1 signal. Only money TAKEN counts.
    # ─────────────────────────────────────────────────────────────────────
    pnl_score = 0.0
    if realized_pnl > 1000000:
        pnl_score = 35
    elif realized_pnl > 500000:
        pnl_score = 30
    elif realized_pnl > 100000:
        pnl_score = 25
    elif realized_pnl > 50000:
        pnl_score = 20
    elif realized_pnl > 10000:
        pnl_score = 14
    elif realized_pnl > 5000:
        pnl_score = 10
    elif realized_pnl > 1000:
        pnl_score = 6
    elif realized_pnl > 0:
        pnl_score = 2
    score += pnl_score
    components["pnl_score"] = pnl_score

    # ─────────────────────────────────────────────────────────────────────
    # 2. TRADE COUNT (0-20) — active wallets = established traders.
    # ─────────────────────────────────────────────────────────────────────
    trades_score = 0.0
    if total_trades and total_trades > 500:
        trades_score = 20
    elif total_trades and total_trades > 200:
        trades_score = 17
    elif total_trades and total_trades > 100:
        trades_score = 14
    elif total_trades and total_trades > 50:
        trades_score = 11
    elif total_trades and total_trades > 20:
        trades_score = 7
    elif total_trades and total_trades > 10:
        trades_score = 4
    elif total_trades and total_trades > 5:
        trades_score = 2
    score += trades_score
    components["trades_score"] = trades_score

    # ─────────────────────────────────────────────────────────────────────
    # 3. WIN RATE (0-10) — consistency
    # ─────────────────────────────────────────────────────────────────────
    winrate_score = 0.0
    if win_rate and win_rate > 0.80:
        winrate_score = 10
    elif win_rate and win_rate > 0.65:
        winrate_score = 8
    elif win_rate and win_rate > 0.50:
        winrate_score = 5
    elif win_rate and win_rate > 0.35:
        winrate_score = 3
    score += winrate_score
    components["winrate_score"] = winrate_score

    # ═════════════════════════════════════════════════════════════════════
    # SECONDARY SIGNALS (moderate weight)
    # ═════════════════════════════════════════════════════════════════════

    # ─────────────────────────────────────────────────────────────────────
    # 4. AVERAGE ROI (0-10) — how well they trade per token
    # ─────────────────────────────────────────────────────────────────────
    roi_score = 0.0
    roi_pct = (avg_roi - 1) * 100 if avg_roi and avg_roi > 1 else 0
    if roi_pct > 1000:
        roi_score = 10
    elif roi_pct > 500:
        roi_score = 8
    elif roi_pct > 200:
        roi_score = 6
    elif roi_pct > 100:
        roi_score = 4
    elif roi_pct > 50:
        roi_score = 2
    score += roi_score
    components["roi_score"] = roi_score

    # ─────────────────────────────────────────────────────────────────────
    # 5. ENTRY TIMING (0-8) — earlier = better
    # ─────────────────────────────────────────────────────────────────────
    timing_score = 0.0
    if entry_timing_score is not None:
        if entry_timing_score < 0.05:
            timing_score = 8
        elif entry_timing_score < 0.1:
            timing_score = 6
        elif entry_timing_score < 0.2:
            timing_score = 4
        elif entry_timing_score < 0.4:
            timing_score = 2
    score += timing_score
    components["timing_score"] = timing_score

    # ─────────────────────────────────────────────────────────────────────
    # 6. WALLET AGE (0-5) — longer = established
    # ─────────────────────────────────────────────────────────────────────
    age_score = 0.0
    if wallet_age_days:
        if wallet_age_days > 365:
            age_score = 5
        elif wallet_age_days > 180:
            age_score = 4
        elif wallet_age_days > 90:
            age_score = 3
        elif wallet_age_days > 30:
            age_score = 2
        elif wallet_age_days > 7:
            age_score = 1
    score += age_score
    components["age_score"] = age_score

    # ─────────────────────────────────────────────────────────────────────
    # 7. SMART MONEY TAG (0-5)
    # ─────────────────────────────────────────────────────────────────────
    tag_score = 0.0
    tag_lower = (smart_money_tag or "").lower()
    all_tags = set((wallet_tags or "").lower().split(","))
    if "top1" in tag_lower or "top1" in all_tags:
        tag_score = 5
    elif "top2" in tag_lower or "top3" in tag_lower:
        tag_score = 4
    elif "top5" in tag_lower or "smart" in tag_lower:
        tag_score = 3
    elif "kol" in all_tags:
        tag_score = 4
    elif any(t.startswith("top") for t in all_tags):
        tag_score = 2
    score += tag_score
    components["tag_score"] = tag_score

    # ─────────────────────────────────────────────────────────────────────
    # 8. INSIDER BONUS (0-5) — following insiders = alpha
    # ─────────────────────────────────────────────────────────────────────
    insider_score = 5.0 if insider_flag else 0.0
    score += insider_score
    components["insider_score"] = insider_score

    # ─────────────────────────────────────────────────────────────────────
    # 9. DEFI + PORTFOLIO (0-5)
    # ─────────────────────────────────────────────────────────────────────
    defi_score = 0.0
    if defi_value and defi_value > 100000:
        defi_score = 3
    elif defi_value and defi_value > 10000:
        defi_score = 2
    elif defi_value and defi_value > 0:
        defi_score = 1
    if zerion_value and zerion_value > 100000:
        defi_score += 2
    elif zerion_value and zerion_value > 0:
        defi_score += 1
    score += defi_score
    components["defi_score"] = defi_score

    # ─────────────────────────────────────────────────────────────────────
    # 10. SOCIAL PRESENCE (0-2)
    # ─────────────────────────────────────────────────────────────────────
    social_score = 2.0 if twitter_username else 0.0
    score += social_score
    components["social_score"] = social_score

    # ═════════════════════════════════════════════════════════════════════
    # PENALTIES (subtracted from score)
    # ═════════════════════════════════════════════════════════════════════

    # ── ROUND TRIPS (-15 per, max -45) ──
    round_trip_penalty = 0.0
    if round_trip_count:
        round_trip_penalty = min(45, round_trip_count * 15)
    score -= round_trip_penalty
    components["round_trip_penalty"] = -round_trip_penalty

    # ── COPY TRADE (-20) ──
    copy_penalty = 20.0 if copy_trade_flag else 0.0
    score -= copy_penalty
    components["copy_penalty"] = -copy_penalty

    # ── RUG HISTORY (-100 per rug, uncapped) ──
    rug_penalty = 0.0
    if rug_history_count:
        rug_penalty = rug_history_count * 100
    score -= rug_penalty
    components["rug_penalty"] = -rug_penalty

    # ── LOW WIN RATE PENALTY ──
    low_win_penalty = 0.0
    if tokens_total and tokens_total >= 10 and win_rate and win_rate < 0.30:
        low_win_penalty = 10
    score -= low_win_penalty
    components["low_win_penalty"] = -low_win_penalty

    final_score = max(0, min(100, round(score, 1)))
    components["wallet_score"] = final_score
    return components


def compute_round_trips(conn: sqlite3.Connection) -> dict[str, int]:
    """
    Count "round trips" per wallet.
    A round trip = token where profit > 0 but sell_count = 0.
    They made money on paper but didn't realize it.
    """
    c = conn.cursor()
    c.execute(
        """
        SELECT wallet_address, COUNT(*) as rt_count
        FROM wallet_token_entries
        WHERE profit > 0
          AND (sell_tx_count IS NULL OR sell_tx_count = 0)
          AND unrealized_profit > 0
        GROUP BY wallet_address
    """
    )
    return {row[0]: row[1] for row in c.fetchall()}


# ── Discovery ───────────────────────────────────────────────────────────────


def get_holders_for_token(chain: str, address: str, limit: int = HOLDERS_PER_TOKEN) -> list[dict]:
    """Get top holders/traders for a token via GMGN.

    GMGN CLI max is 100 per call. To reach 1000, makes multiple calls
    with different sort orders and deduplicates by wallet address.
    """
    gmgn_chain = CHAIN_MAP.get(chain.lower())
    if not gmgn_chain:
        return []

    GMGN_MAX = 100  # CLI hard limit

    # Sort strategies to maximize wallet coverage (profitable traders only)
    SORT_ORDERS = [
        ("amount_percentage", "desc"),  # biggest holders
        ("profit", "desc"),  # most profitable
        ("unrealized_profit", "desc"),  # best unrealized gains
        ("buy_volume_cur", "desc"),  # biggest buyers
        ("sell_volume_cur", "desc"),  # biggest sellers
    ]

    seen_addresses: set = set()
    all_holders: list[dict] = []

    for order_by, direction in SORT_ORDERS:
        if len(all_holders) >= limit:
            break

        batch_limit = min(GMGN_MAX, limit - len(all_holders))
        data = gmgn_cmd(
            [
                "token",
                "holders",
                "--chain",
                gmgn_chain,
                "--address",
                address,
                "--limit",
                str(batch_limit),
                "--order-by",
                order_by,
                "--direction",
                direction,
                "--raw",
            ]
        )

        if not data:
            continue

        batch = data if isinstance(data, list) else data.get("list", [])
        added = 0
        for h in batch:
            addr = h.get("address", "")
            if addr and addr not in seen_addresses:
                seen_addresses.add(addr)
                all_holders.append(h)
                added += 1
            if len(all_holders) >= limit:
                break

        if added > 0:
            log.debug(f"    {order_by}/{direction}: +{added} wallets (total {len(all_holders)})")

    return all_holders[:limit]


def enrich_wallets_from_tokens(
    conn: sqlite3.Connection,
    tokens: list[dict],
    min_token_score: float = 30,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Scan top holders from multiple tokens, merge wallet data.
    A wallet appearing in N tokens with M profitable = win_rate = M/N.
    """
    cursor = conn.cursor()
    now = time.time()

    # Collect all wallet appearances across tokens
    # wallet_addr -> [{token, symbol, profit, roi, trades, entry_time, ...}]
    wallet_appearances: dict[str, list[dict]] = {}
    tokens_scanned = 0
    holders_found = 0

    for token_info in tokens:
        chain = token_info.get("chain", "")
        addr = token_info.get("contract_address", "")
        sym = token_info.get("symbol", "?")
        score = token_info.get("score", 0)

        if score < min_token_score:
            continue

        log.info(f"  Scanning {sym} (score={score:.1f})...")
        holders = get_holders_for_token(chain, addr)
        tokens_scanned += 1

        for h in holders:
            w = h.get("address", "")
            if not w:
                continue

            profit = h.get("profit", 0) or 0
            roi = h.get("profit_change", 0) or 0
            realized = h.get("realized_profit", 0) or 0
            unrealized = h.get("unrealized_profit", 0) or 0
            buy_count = h.get("buy_tx_count_cur", 0) or 0
            sell_count = h.get("sell_tx_count_cur", 0) or 0
            start_at = h.get("start_holding_at")
            tag = h.get("wallet_tag_v2", "")
            tags = h.get("tags", [])
            twitter = h.get("twitter_username", "")

            is_profitable = 1 if profit > 0 else 0
            holders_found += 1

            entry = {
                "chain": chain,
                "token_address": addr,
                "token_symbol": sym,
                "profit": profit,
                "profit_change": roi,
                "realized_profit": realized,
                "unrealized_profit": unrealized,
                "buy_tx_count": buy_count,
                "sell_tx_count": sell_count,
                "total_trades": buy_count + sell_count,
                "avg_cost": h.get("avg_cost"),
                "start_holding_at": start_at,
                "end_holding_at": h.get("end_holding_at"),
                "is_profitable": is_profitable,
                "tag": tag,
                "tags": tags,
                "twitter": twitter,
            }

            if w not in wallet_appearances:
                wallet_appearances[w] = []
            wallet_appearances[w].append(entry)

    log.info(
        f"  Scanned {tokens_scanned} tokens, found {holders_found} holder entries, {len(wallet_appearances)} unique wallets"
    )

    # Aggregate per wallet and save
    wallets_updated = 0
    wallets_new = 0

    for wallet_addr, appearances in wallet_appearances.items():
        chain = appearances[0]["chain"]  # all should be same chain
        total_profit = sum(a["profit"] for a in appearances)
        total_realized = sum(a["realized_profit"] for a in appearances)
        total_unrealized = sum(a["unrealized_profit"] for a in appearances)
        total_trades = sum(a["total_trades"] for a in appearances)
        total_buys = sum(a["buy_tx_count"] for a in appearances)
        total_sells = sum(a["sell_tx_count"] for a in appearances)

        # ROI: average across tokens (weighted by trade count)
        rois = [a["profit_change"] for a in appearances if a["profit_change"] and a["profit_change"] > 0]
        avg_roi = sum(rois) / len(rois) if rois else 0

        # Win rate
        profitable = sum(a["is_profitable"] for a in appearances)
        win_rate = profitable / len(appearances) if appearances else 0

        # Entry timing: average normalized position (0=early, 1=late)
        # Lower start_holding_at relative to token launch = earlier entry
        entry_scores = []
        for a in appearances:
            if a["start_holding_at"] and a["total_trades"] > 0:
                # Simple heuristic: if they have sells, they've been active a while
                entry_scores.append(0.2 if a["sell_tx_count"] > 0 else 0.1)
        avg_entry = sum(entry_scores) / len(entry_scores) if entry_scores else 0.5

        # Best tag across all appearances
        all_tags = set()
        for a in appearances:
            if a["tag"]:
                all_tags.add(a["tag"])
            for t in a["tags"] or []:
                all_tags.add(t)
        best_tag = (
            min(
                all_tags,
                key=lambda t: (int(t.replace("TOP", "99")) if t.startswith("TOP") else 99),
            )
            if all_tags
            else ""
        )

        # Twitter (first non-empty)
        twitter = next((a["twitter"] for a in appearances if a["twitter"]), "")

        # Source tokens
        # Score
        # Compute wallet age in days
        now_ts = time.time()
        entry_times = [a["start_holding_at"] for a in appearances if a.get("start_holding_at")]
        age_days = (now_ts - min(entry_times)) / 86400 if entry_times else 0

        wallet_result = score_wallet_v3(
            realized_pnl=total_realized or total_profit,
            total_profit=total_profit,
            avg_roi=avg_roi,
            win_rate=win_rate,
            total_trades=total_trades,
            entry_timing_score=avg_entry,
            smart_money_tag=best_tag,
            wallet_tags=",".join(all_tags),
            insider_flag=1 if "insider" in all_tags else 0,
            copy_trade_flag=0,
            rug_history_count=0,
            trading_pattern="",
            tokens_profitable=profitable,
            tokens_total=len(appearances),
            zerion_value=0,
            defi_value=0,
            round_trip_count=0,
            wallet_age_days=age_days,
            twitter_username=twitter,
        )
        wallet_score = wallet_result["wallet_score"]

        if dry_run:
            continue

        # Upsert wallet with component scores
        cursor.execute(
            """
            INSERT INTO tracked_wallets
                (address, chain, discovered_at, last_updated,
                 wallet_score, pnl_score, trades_score, winrate_score, roi_score,
                 timing_score, age_score, tag_score, insider_score, defi_score,
                 social_score, round_trip_penalty, copy_penalty, rug_penalty,
                 low_win_penalty,
                 realized_pnl, unrealized_pnl, total_profit,
                 avg_roi, total_trades, buy_count, sell_count,
                 entry_timing_score, win_rate,
                 tokens_profitable, tokens_total,
                 smart_money_tag, wallet_tags, twitter_username,
                 first_seen_at, last_active_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(chain, address) DO UPDATE SET
                last_updated = excluded.last_updated,
                wallet_score = excluded.wallet_score,
                pnl_score = excluded.pnl_score,
                trades_score = excluded.trades_score,
                winrate_score = excluded.winrate_score,
                roi_score = excluded.roi_score,
                timing_score = excluded.timing_score,
                age_score = excluded.age_score,
                tag_score = excluded.tag_score,
                insider_score = excluded.insider_score,
                defi_score = excluded.defi_score,
                social_score = excluded.social_score,
                round_trip_penalty = excluded.round_trip_penalty,
                copy_penalty = excluded.copy_penalty,
                rug_penalty = excluded.rug_penalty,
                low_win_penalty = excluded.low_win_penalty,
                realized_pnl = excluded.realized_pnl,
                unrealized_pnl = excluded.unrealized_pnl,
                total_profit = excluded.total_profit,
                avg_roi = excluded.avg_roi,
                total_trades = excluded.total_trades,
                buy_count = excluded.buy_count,
                sell_count = excluded.sell_count,
                entry_timing_score = excluded.entry_timing_score,
                win_rate = excluded.win_rate,
                tokens_profitable = excluded.tokens_profitable,
                tokens_total = excluded.tokens_total,
                smart_money_tag = excluded.smart_money_tag,
                wallet_tags = excluded.wallet_tags,
                twitter_username = excluded.twitter_username,
                last_active_at = excluded.last_active_at
        """,
            (
                wallet_addr,
                chain,
                now,
                now,
                wallet_score,
                wallet_result.get("pnl_score", 0),
                wallet_result.get("trades_score", 0),
                wallet_result.get("winrate_score", 0),
                wallet_result.get("roi_score", 0),
                wallet_result.get("timing_score", 0),
                wallet_result.get("age_score", 0),
                wallet_result.get("tag_score", 0),
                wallet_result.get("insider_score", 0),
                wallet_result.get("defi_score", 0),
                wallet_result.get("social_score", 0),
                wallet_result.get("round_trip_penalty", 0),
                wallet_result.get("copy_penalty", 0),
                wallet_result.get("rug_penalty", 0),
                wallet_result.get("low_win_penalty", 0),
                total_realized,
                total_unrealized,
                total_profit,
                avg_roi,
                total_trades,
                total_buys,
                total_sells,
                avg_entry,
                win_rate,
                profitable,
                len(appearances),
                best_tag,
                ",".join(all_tags),
                twitter,
                appearances[0].get("start_holding_at") or now,
                now,
            ),
        )

        # Check if new
        cursor.execute(
            "SELECT id FROM tracked_wallets WHERE chain = ? AND address = ?",
            (chain, wallet_addr),
        )
        if cursor.fetchone():
            wallets_updated += 1
        else:
            wallets_new += 1

        # Save per-token entries
        for a in appearances:
            try:
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO wallet_token_entries
                        (wallet_address, chain, token_address, token_symbol,
                         profit, profit_change, realized_profit, unrealized_profit,
                         buy_tx_count, sell_tx_count, avg_cost,
                         start_holding_at, end_holding_at, is_profitable,
                         discovered_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        wallet_addr,
                        chain,
                        a["token_address"],
                        a["token_symbol"],
                        a["profit"],
                        a["profit_change"],
                        a["realized_profit"],
                        a["unrealized_profit"],
                        a["buy_tx_count"],
                        a["sell_tx_count"],
                        a["avg_cost"],
                        a["start_holding_at"],
                        a["end_holding_at"],
                        a["is_profitable"],
                        now,
                    ),
                )
            except Exception:
                pass

    conn.commit()
    return {
        "tokens_scanned": tokens_scanned,
        "holders_found": holders_found,
        "unique_wallets": len(wallet_appearances),
        "wallets_new": wallets_new,
        "wallets_updated": wallets_updated,
    }


# ── Reporting ───────────────────────────────────────────────────────────────


def report(conn: sqlite3.Connection, limit: int = 20):
    """Print top wallets with full metrics."""
    cursor = conn.cursor()

    cursor.execute(
        f"""
        SELECT address, chain, wallet_score, realized_pnl, avg_roi,
               win_rate, total_trades, tokens_profitable, tokens_total,
               smart_money_tag, twitter_username,
               trading_pattern, insider_flag, copy_trade_flag, rug_history_count
        FROM tracked_wallets
        WHERE wallet_score > 0
        ORDER BY wallet_score DESC
        LIMIT {limit}
    """
    )

    print(f"\n{'='*80}")
    print(f"TOP {limit} WALLETS BY SCORE")
    print(f"{'='*80}")
    print(
        f"{'Score':>6} {'PnL':>12} {'ROI':>8} {'WinRate':>8} {'Trades':>7} {'Tokens':>7} {'Tag':>6} {'Pattern':>8} {'Flags':>6} {'Wallet'}"
    )
    print(f"{'-'*6} {'-'*12} {'-'*8} {'-'*8} {'-'*7} {'-'*7} {'-'*6} {'-'*8} {'-'*6} {'-'*25}")

    for r in cursor.fetchall():
        (
            addr,
            chain,
            score,
            pnl,
            roi,
            wr,
            trades,
            prof,
            total,
            tag,
            tokens,
            tw,
            pattern,
            insider,
            copy,
            rugs,
        ) = r
        flags = []
        if insider:
            flags.append("IN")
        if copy:
            flags.append("CP")
        if rugs and rugs > 0:
            flags.append(f"R{rugs}")
        flag_str = ",".join(flags) or "-"
        pnl_str = f"${pnl or 0:>11,.0f}" if pnl else "      $0"
        roi_str = f"{(roi or 0)*100:>6.0f}%" if roi else "    -%"
        wr_str = f"{(wr or 0)*100:>6.0f}%" if wr else "    -%"
        trades_str = f"{trades or 0:>6}"
        tokens_str = f"{prof or 0}/{total or 0}"
        print(
            f"{score:>6.1f} {pnl_str} {roi_str} {wr_str} {trades_str} {tokens_str:>7} {tag or '-':>6} {pattern or '-':>8} {flag_str:>6} {addr[:25]}..."
        )

    # Stats
    cursor.execute(
        "SELECT count(*), avg(wallet_score), max(wallet_score), count(CASE WHEN win_rate > 0.5 THEN 1 END) FROM tracked_wallets"
    )
    total, avg_s, max_s, high_wr = cursor.fetchone()
    print(f"\nTotal: {total} wallets | Avg score: {avg_s:.1f} | Max: {max_s:.1f} | Win rate >50%: {high_wr}")


# ── Zerion Wallet Enrichment ────────────────────────────────────────────────

ZERION_KEY = settings.zerion_api_key


class ZerionWalletEnricher:
    def __init__(self):
        self.session = requests.Session()
        if ZERION_KEY:
            auth = base64.b64encode((ZERION_KEY + ":").encode()).decode()
            self.session.headers.update(
                {
                    "Authorization": f"Basic {auth}",
                    "accept": "application/json",
                }
            )
        self.last_request = 0

    def _rate_limit(self):
        elapsed = time.time() - self.last_request
        if elapsed < 1.5:
            time.sleep(1.5 - elapsed)
        self.last_request = time.time()

    def enrich_wallet(self, address: str) -> dict[str, Any]:
        """Get portfolio value and activity from Zerion."""
        if not ZERION_KEY:
            return {}

        self._rate_limit()
        try:
            r = self.session.get(f"https://api.zerion.io/v1/wallets/{address}/portfolio", timeout=15)
            if r.status_code == 429:
                time.sleep(5)
                return {}
            if r.status_code != 200:
                return {}
            data = r.json()
        except Exception:
            return {}

        attrs = data.get("data", {}).get("attributes", {})
        total = attrs.get("total", {})
        changes = attrs.get("changes", {})

        result = {
            "zerion_value": total.get("positions", 0),
        }

        if changes:
            result["zerion_24h_change_pct"] = changes.get("percent_1d")

        dist = attrs.get("positions_distribution_by_type", {})
        if dist:
            deposited = dist.get("deposited", 0) or 0
            staked = dist.get("staked", 0) or 0
            if deposited > 0 or staked > 0:
                result["zerion_defi_value"] = deposited + staked

        return result


# ── V2 Schema Additions (new columns) ──────────────────────────────────────


def upgrade_wallet_db(conn: sqlite3.Connection):
    """Add new columns for v2 enrichment features."""
    c = conn.cursor()

    # Check existing columns
    c.execute("PRAGMA table_info(tracked_wallets)")
    existing = {r[1] for r in c.fetchall()}

    new_columns = {
        "copy_trade_flag": "INTEGER DEFAULT 0",
        "insider_flag": "INTEGER DEFAULT 0",
        "rug_history_count": "INTEGER DEFAULT 0",
        "trading_pattern": "TEXT",
        "avg_hold_hours": "REAL",
        "zerion_value": "REAL",
        "zerion_24h_change_pct": "REAL",
        "zerion_defi_value": "REAL",
    }

    for col, col_type in new_columns.items():
        if col not in existing:
            try:
                c.execute(f"ALTER TABLE tracked_wallets ADD COLUMN {col} {col_type}")
            except sqlite3.OperationalError:
                pass

    conn.commit()


# ── Copy-Trade Detection ───────────────────────────────────────────────────


def detect_copy_traders(conn: sqlite3.Connection) -> int:
    """
    Detect wallets that copy other wallets.

    Heuristic: A wallet is a copy trader if it consistently buys the same
    tokens as another wallet but LATER (start_holding_at is always greater).

    Steps:
    1. For each token, get all wallet entries sorted by start_holding_at
    2. If wallet A bought after wallet B on 3+ tokens with <5min delay,
       A is likely copying B
    """
    c = conn.cursor()

    # Get all token entries grouped by token
    c.execute(
        """
        SELECT token_address, wallet_address, start_holding_at, profit_change
        FROM wallet_token_entries
        WHERE start_holding_at IS NOT NULL
        ORDER BY token_address, start_holding_at
    """
    )

    # Group by token
    token_entries = {}
    for row in c.fetchall():
        token = row[0]
        if token not in token_entries:
            token_entries[token] = []
        token_entries[token].append(
            {
                "wallet": row[1],
                "time": row[2],
                "roi": row[3] or 0,
            }
        )

    # For each pair of wallets, count how many times one bought after the other
    from collections import defaultdict

    follower_counts = defaultdict(lambda: defaultdict(int))

    for token, entries in token_entries.items():
        if len(entries) < 2:
            continue
        # Sort by entry time
        entries.sort(key=lambda x: x["time"])
        # For each pair, the later one might be copying the earlier one
        for i, later in enumerate(entries):
            for earlier in entries[:i]:
                time_diff = later["time"] - earlier["time"]
                # If bought within 10 minutes after, count as potential copy
                if 0 < time_diff < 600:
                    follower_counts[later["wallet"]][earlier["wallet"]] += 1

    # Mark wallets that follow 2+ other wallets on 3+ tokens
    flagged = 0
    for follower, leaders in follower_counts.items():
        total_copies = sum(leaders.values())
        if total_copies >= 3:
            c.execute(
                """
                UPDATE tracked_wallets
                SET copy_trade_flag = 1
                WHERE address = ? AND copy_trade_flag = 0
            """,
                (follower,),
            )
            flagged += c.rowcount

    conn.commit()
    return flagged


# ── Insider Detection ───────────────────────────────────────────────────────


def detect_insiders(conn: sqlite3.Connection) -> int:
    """
    Detect insider wallets.

    Heuristics:
    1. Wallet funded by the token creator (fund_from matches creator)
    2. Wallet has 'is_suspicious' flag from GMGN
    3. Wallet bought BEFORE the token's public launch (very early entry)
    4. Wallet's avg ROI is unrealistically high (>20x) with few trades
    """
    c = conn.cursor()

    flagged = 0

    # 1. Very early entries with extreme ROI (possible insider)
    c.execute(
        """
        SELECT wte.wallet_address, COUNT(*) as early_count
        FROM wallet_token_entries wte
        WHERE wte.profit_change > 10  -- >1000% ROI
          AND wte.buy_tx_count <= 3   -- very few buys
          AND wte.is_profitable = 1
        GROUP BY wte.wallet_address
        HAVING early_count >= 2
    """
    )
    for wallet, _count in c.fetchall():
        c.execute(
            """
            UPDATE tracked_wallets
            SET insider_flag = 1
            WHERE address = ? AND insider_flag = 0
        """,
            (wallet,),
        )
        flagged += c.rowcount

    # 2. Wallets with suspiciously high avg ROI
    c.execute(
        """
        SELECT address FROM tracked_wallets
        WHERE avg_roi > 20  -- >2000% average ROI
          AND total_trades < 10
          AND insider_flag = 0
    """
    )
    for (wallet,) in c.fetchall():
        c.execute("UPDATE tracked_wallets SET insider_flag = 1 WHERE address = ?", (wallet,))
        flagged += c.rowcount

    conn.commit()
    return flagged


# ── Rug History Detection ───────────────────────────────────────────────────


def detect_rug_history(conn: sqlite3.Connection) -> int:
    """
    Count how many rugged tokens each wallet held.

    A token is "rugged" if:
    - GMGN honeypot = true
    - RugCheck rugged = true
    - Profit was very negative (< -90%) with high initial buy

    We check wallet_token_entries and cross-reference with token data
    from the enricher output.
    """
    c = conn.cursor()

    # Load rugged token list from enricher output
    rugged_tokens = set()
    try:
        import json

        top100_path = settings.output_path
        if top100_path.exists():
            with open(top100_path) as f:
                data = json.load(f)
            for t in data.get("tokens", []):
                if t.get("gmgn_honeypot") or t.get("rugcheck_rugged") or t.get("goplus_is_honeypot"):
                    rugged_tokens.add(t.get("contract_address", ""))
    except Exception:
        pass

    # Also flag entries with massive losses as potential rugs
    c.execute(
        """
        SELECT wallet_address, COUNT(*) as rug_count
        FROM wallet_token_entries
        WHERE (profit_change < -0.9 OR profit < -1000)
          AND is_profitable = 0
        GROUP BY wallet_address
    """
    )

    for wallet, count in c.fetchall():
        # Add any known rugged tokens
        c.execute(
            """
            SELECT COUNT(*) FROM wallet_token_entries
            WHERE wallet_address = ? AND token_address IN (
                SELECT value FROM json_each(?)
            )
        """,
            (wallet, json.dumps(list(rugged_tokens))),
        )
        extra = c.fetchone()[0]

        total_rugs = count + extra
        c.execute(
            """
            UPDATE tracked_wallets
            SET rug_history_count = ?
            WHERE address = ?
        """,
            (total_rugs, wallet),
        )

    conn.commit()
    return len(rugged_tokens)


# ── Main ────────────────────────────────────────────────────────────────────


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Wallet tracker")
    parser.add_argument("--min-score", type=float, default=30)
    parser.add_argument("--max-tokens", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--async-mode",
        action="store_true",
        dest="async_mode",
        help="Use async parallel enrichment (faster)",
    )
    parser.add_argument(
        "--sequential",
        action="store_true",
        help="Force sequential enrichment (original)",
    )
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Wallet Tracker starting")
    log.info(f"Min token score: {args.min_score}")
    log.info(f"Holders per token: {HOLDERS_PER_TOKEN}")
    log.info(f"Mode: {'async' if args.async_mode else 'sequential'}")
    log.info("=" * 60)

    # Load top tokens
    if not Path(TOP_TOKENS_PATH).exists():
        log.warning(f"No {TOP_TOKENS_PATH} found. Run token_enricher.py first.")
        return 1

    with open(TOP_TOKENS_PATH) as f:
        data = json.load(f)
    tokens = data.get("tokens", [])

    if args.max_tokens:
        tokens = tokens[: args.max_tokens]

    log.info(f"Loaded {len(tokens)} tokens from enricher output")

    # Init DB
    conn = init_wallet_db()
    start = time.time()

    if args.async_mode and not args.sequential:
        # Async parallel enrichment
        from hermes_screener.async_wallets import enrich_wallets_async_sync

        result = enrich_wallets_async_sync(
            conn,
            tokens,
            min_token_score=args.min_score,
            max_concurrent_tokens=3,
            dry_run=args.dry_run,
        )
    else:
        # Sequential enrichment (original)
        result = enrich_wallets_from_tokens(
            conn,
            tokens,
            min_token_score=args.min_score,
            dry_run=args.dry_run,
        )

    elapsed = time.time() - start
    log.info(f"Done in {elapsed:.1f}s: {json.dumps(result)}")

    # Run pattern detection
    log.info("Running pattern detection...")
    upgrade_wallet_db(conn)

    flagged_copy = detect_copy_traders(conn)
    log.info(f"  Copy-trade flagged: {flagged_copy}")

    flagged_insider = detect_insiders(conn)
    log.info(f"  Insider flagged: {flagged_insider}")

    detect_rug_history(conn)
    log.info("  Rug history computed")

    # Mobula trader classification enrichment
    try:
        from mobula_wallet_enricher import enrich_wallets_in_db

        log.info("Running Mobula enrichment...")
        enrich_wallets_in_db(limit=100)
        log.info("  Mobula enrichment done")
    except Exception as e:
        log.info(f"  Mobula skipped: {e}")

    # Re-score all wallets with new flags
    log.info("Re-scoring with pattern flags...")
    c = conn.cursor()
    c.execute(
        "SELECT address, realized_pnl, total_profit, avg_roi, win_rate, total_trades, entry_timing_score, smart_money_tag, wallet_tags, insider_flag, copy_trade_flag, rug_history_count, trading_pattern, tokens_profitable, tokens_total, zerion_value, zerion_defi_value, twitter_username, first_seen_at FROM tracked_wallets WHERE wallet_score > 0"
    )

    round_trips = compute_round_trips(conn)

    rescored = 0
    for row in c.fetchall():
        (
            addr,
            rpnl,
            tprof,
            roi,
            wr,
            trades,
            entry,
            stag,
            wtags,
            ins,
            copy,
            rugs,
            pattern,
            prof_t,
            total_t,
            zval,
            dval,
            tw,
            first_seen,
        ) = row

        if first_seen:
            age_days = (time.time() - first_seen) / 86400
        else:
            age_days = 0
        rt = round_trips.get(addr, 0)

        new_result = score_wallet_v3(
            realized_pnl=rpnl or 0,
            total_profit=tprof or 0,
            avg_roi=roi or 0,
            win_rate=wr or 0,
            total_trades=trades or 0,
            entry_timing_score=entry or 0.5,
            smart_money_tag=stag or "",
            wallet_tags=wtags or "",
            insider_flag=ins or 0,
            copy_trade_flag=copy or 0,
            rug_history_count=rugs or 0,
            trading_pattern=pattern or "",
            tokens_profitable=prof_t or 0,
            tokens_total=total_t or 0,
            zerion_value=zval or 0,
            defi_value=dval or 0,
            round_trip_count=rt,
            wallet_age_days=age_days,
            twitter_username=tw or "",
        )
        new_score = new_result["wallet_score"]
        conn.execute(
            """
            UPDATE tracked_wallets SET
                wallet_score = ?,
                pnl_score = ?,
                trades_score = ?,
                winrate_score = ?,
                roi_score = ?,
                timing_score = ?,
                age_score = ?,
                tag_score = ?,
                insider_score = ?,
                defi_score = ?,
                social_score = ?,
                round_trip_penalty = ?,
                copy_penalty = ?,
                rug_penalty = ?,
                low_win_penalty = ?
            WHERE address = ?
            """,
            (
                new_score,
                new_result.get("pnl_score", 0),
                new_result.get("trades_score", 0),
                new_result.get("winrate_score", 0),
                new_result.get("roi_score", 0),
                new_result.get("timing_score", 0),
                new_result.get("age_score", 0),
                new_result.get("tag_score", 0),
                new_result.get("insider_score", 0),
                new_result.get("defi_score", 0),
                new_result.get("social_score", 0),
                new_result.get("round_trip_penalty", 0),
                new_result.get("copy_penalty", 0),
                new_result.get("rug_penalty", 0),
                new_result.get("low_win_penalty", 0),
                addr,
            ),
        )
        rescored += 1
    conn.commit()
    log.info(f"  Re-scored {rescored} wallets")

    report(conn)
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
