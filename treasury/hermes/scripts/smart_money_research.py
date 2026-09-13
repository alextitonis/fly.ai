#!/usr/bin/env python3
"""
Smart-Money Research System: Pattern learning + insights.

Uses the new pipeline infrastructure:
  telegram_scraper.py    → contract harvesting
  token_discovery.py     → Dexscreener boosted/profiles
  token_enricher.py      → 12-layer enrichment
  wallet_tracker.py      → wallet discovery + scoring

This script ONLY does what the pipeline doesn't:
  1. Pattern learning (ML-based wallet behavior classification)
  2. Leaderboard generation (top wallets + top tokens)
  3. Insights export (human-readable reports)

Usage:
  python3 smart_money_research.py              # generate leaderboard + insights
  python3 smart_money_research.py --single <addr> [chain]  # analyze single token
  python3 smart_money_research.py --learn      # force pattern update
"""

import argparse
import json
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))

from hermes_screener.config import settings
from hermes_screener.logging import get_logger
from hermes_screener.metrics import start_metrics_server

DB_PATH = settings.db_path
WALLETS_DB = settings.wallets_db_path
TOP_TOKENS_PATH = settings.output_path
DATA_DIR = settings.hermes_home / "data" / "smart_money"
INSIGHTS_PATH = DATA_DIR / "insights.json"
LEADERBOARD_PATH = DATA_DIR / "leaderboard.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)

log = get_logger("smart_money")
start_metrics_server()

# ── Pattern Learning ────────────────────────────────────────────────────────


def learn_patterns(conn: sqlite3.Connection) -> dict[str, Any]:
    """
    Analyze wallet behavior patterns from token_entries.
    Groups wallets by trading pattern and computes aggregate stats.
    """
    c = conn.cursor()

    patterns = {}
    for tag in ["insider", "sniper", "kol", "smart", "whale"]:
        c.execute(
            """
            SELECT count(*), avg(wallet_score), avg(realized_pnl),
                   avg(win_rate), avg(total_trades), avg(avg_roi)
            FROM tracked_wallets
            WHERE wallet_tags LIKE ?
        """,
            (f"%{tag}%",),
        )
        row = c.fetchone()
        if row and row[0] > 0:
            patterns[tag] = {
                "count": row[0],
                "avg_score": round(row[1] or 0, 1),
                "avg_pnl": round(row[2] or 0, 2),
                "avg_win_rate": round((row[3] or 0) * 100, 1),
                "avg_trades": round(row[4] or 0, 1),
                "avg_roi": round((row[5] or 0) * 100, 1),
            }

    return patterns


def get_leaderboard(limit: int = 50) -> list[dict[str, Any]]:
    """Get top wallets ranked by v3 score."""
    if not WALLETS_DB.exists():
        return []

    conn = sqlite3.connect(str(WALLETS_DB))
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute(
        f"""
        SELECT address, chain, wallet_score, realized_pnl, avg_roi,
               win_rate, total_trades, tokens_profitable, tokens_total,
               smart_money_tag, wallet_tags, twitter_username,
               trading_pattern, insider_flag, copy_trade_flag,
               rug_history_count, source_tokens, zerion_value
        FROM tracked_wallets
        WHERE wallet_score > 0
        ORDER BY wallet_score DESC
        LIMIT {limit}
    """
    )

    leaderboard = []
    for row in c.fetchall():
        leaderboard.append(dict(row))

    conn.close()
    return leaderboard


# ── Token Analysis ──────────────────────────────────────────────────────────


def analyze_token(chain: str, address: str) -> dict[str, Any]:
    """
    Single-token analysis using the enricher output.
    Reads from the pre-computed top100.json instead of calling APIs.
    """
    if not TOP_TOKENS_PATH.exists():
        return {}

    with open(TOP_TOKENS_PATH) as f:
        data = json.load(f)

    for token in data.get("tokens", []):
        if token.get("contract_address") == address:
            return {
                "token": token,
                "analysis": {
                    "score": token.get("score"),
                    "positives": token.get("positives", []),
                    "negatives": token.get("negatives", []),
                    "fdv": token.get("fdv"),
                    "volume_24h": token.get("volume_h24"),
                    "channel_count": token.get("channel_count"),
                    "gmgn_smart_wallets": token.get("gmgn_smart_wallets"),
                    "cs_risk_score": token.get("cs_risk_score"),
                    "zerion_verified": token.get("zerion_verified"),
                },
            }

    return {}


# ── Insights Generation ────────────────────────────────────────────────────


def generate_insights() -> dict[str, Any]:
    """Generate comprehensive insights from all data sources."""
    insights = {
        "generated_at": time.time(),
        "generated_at_iso": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
    }

    # Token stats
    if TOP_TOKENS_PATH.exists():
        with open(TOP_TOKENS_PATH) as f:
            data = json.load(f)
        tokens = data.get("tokens", [])
        insights["tokens"] = {
            "total": len(tokens),
            "avg_score": round(sum(t.get("score", 0) for t in tokens) / max(len(tokens), 1), 1),
            "top_5": [
                {
                    "symbol": t.get("symbol"),
                    "score": t.get("score"),
                    "fdv": t.get("fdv"),
                    "channel_count": t.get("channel_count"),
                }
                for t in tokens[:5]
            ],
        }

    # Wallet stats
    if WALLETS_DB.exists():
        conn = sqlite3.connect(str(WALLETS_DB))
        c = conn.cursor()

        c.execute(
            "SELECT count(*), avg(wallet_score), max(wallet_score), "
            "count(CASE WHEN insider_flag THEN 1 END), "
            "count(CASE WHEN copy_trade_flag THEN 1 END) "
            "FROM tracked_wallets WHERE wallet_score > 0"
        )
        row = c.fetchone()
        insights["wallets"] = {
            "total": row[0],
            "avg_score": round(row[1] or 0, 1),
            "max_score": round(row[2] or 0, 1),
            "insiders": row[3],
            "copy_traders": row[4],
        }

        # Pattern distribution
        insights["patterns"] = learn_patterns(conn)

        # Leaderboard
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute(
            """
            SELECT address, chain, wallet_score, realized_pnl, avg_roi,
                   win_rate, total_trades, smart_money_tag, trading_pattern,
                   insider_flag
            FROM tracked_wallets WHERE wallet_score > 0
            ORDER BY wallet_score DESC LIMIT 20
        """
        )
        insights["top_wallets"] = [dict(r) for r in cur.fetchall()]

        conn.close()

    # Contract stats
    if DB_PATH.exists():
        conn = sqlite3.connect(str(DB_PATH))
        c = conn.cursor()
        c.execute("SELECT count(*) FROM telegram_contracts_unique")
        insights["contracts"] = {"total": c.fetchone()[0]}
        c.execute("SELECT count(*) FROM telegram_contract_calls")
        insights["contracts"]["total_calls"] = c.fetchone()[0]
        conn.close()

    return insights


# ── Main ────────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Smart-Money Research")
    parser.add_argument("--single", metavar="ADDRESS", help="Analyze single token")
    parser.add_argument("--chain", default="solana", help="Chain for --single")
    parser.add_argument("--learn", action="store_true", help="Force pattern update")
    parser.add_argument("--leaderboard", action="store_true", help="Show leaderboard")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Smart-Money Research starting")
    log.info("=" * 60)

    if args.single:
        result = analyze_token(args.chain, args.single)
        if result:
            print(json.dumps(result, indent=2, default=str))
        else:
            print(f"No data for {args.chain}:{args.single}")
        return

    if args.leaderboard:
        board = get_leaderboard(20)
        print(f"\n{'='*70}")
        print("TOP 20 WALLETS")
        print(f"{'='*70}")
        for w in board:
            flags = []
            if w.get("insider_flag"):
                flags.append("IN")
            if w.get("copy_trade_flag"):
                flags.append("CP")
            flag_str = ",".join(flags) or "-"
            print(
                f"  {w['wallet_score']:>5} ${w['realized_pnl'] or 0:>10,.0f} "
                f"{w['smart_money_tag'] or '-':>6} {(w.get('wallet_tags') or '-')[:12]:>12} "
                f"{flag_str:>4} {w['address'][:30]}..."
            )
        return

    # Default: generate insights
    log.info("Generating insights...")
    insights = generate_insights()

    with open(INSIGHTS_PATH, "w") as f:
        json.dump(insights, f, indent=2, default=str)
    log.info(f"Wrote insights to {INSIGHTS_PATH}")

    board = get_leaderboard(50)
    with open(LEADERBOARD_PATH, "w") as f:
        json.dump(board, f, indent=2, default=str)
    log.info(f"Wrote leaderboard ({len(board)} wallets) to {LEADERBOARD_PATH}")

    # Summary
    tok = insights.get("tokens", {})
    wal = insights.get("wallets", {})
    log.info(f"Tokens: {tok.get('total', 0)} (avg score: {tok.get('avg_score', 0)})")
    log.info(f"Wallets: {wal.get('total', 0)} (avg: {wal.get('avg_score', 0)}, max: {wal.get('max_score', 0)})")
    log.info(f"Insiders: {wal.get('insiders', 0)}, Copy-traders: {wal.get('copy_traders', 0)}")


if __name__ == "__main__":
    main()
