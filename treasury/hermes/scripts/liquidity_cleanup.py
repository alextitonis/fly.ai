#!/usr/bin/env python3
"""
Remove tokens with 0 or NULL liquidity from active databases.

Active tables/files cleaned:
  - top10_tokens.db: current_top10, daily_metrics, telegram_metrics_history
  - twitter_token_analysis.json
  - combined_token_analysis.json

Historical tables are NOT touched.
"""

import json
import sqlite3
import time
from pathlib import Path

DATA = Path.home() / ".hermes" / "data"
DB_PATH = DATA / "central_contracts.db"
TOP10_DB = DATA / "top10_tokens.db"
SCREENER_DIR = DATA / "token_screener"


def cleanup_contracts_db():
    """Remove GMGN-sourced tokens with 0 liquidity from telegram_contracts_unique."""
    if not DB_PATH.exists():
        return 0

    db = sqlite3.connect(str(DB_PATH))

    # Tokens from GMGN trenches that have been in DB for 1h+ with no liquidity
    # (new tokens get a grace period)
    one_hour_ago = time.time() - 3600
    dead = db.execute(
        """
        SELECT chain, contract_address, last_source, last_message_text
        FROM telegram_contracts_unique
        WHERE last_source LIKE 'gmgn_%'
        AND last_seen_at < ?
        AND (last_message_text LIKE '%liq=0%' OR last_message_text LIKE '%mcap=0.0%')
    """,
        (one_hour_ago,),
    ).fetchall()

    if not dead:
        print("  contracts_db: no dead GMGN tokens")
        db.close()
        return 0

    print(f"  contracts_db: removing {len(dead)} dead GMGN tokens")
    for chain, addr, _src, _msg in dead:
        db.execute(
            "DELETE FROM telegram_contract_calls WHERE chain=? AND contract_address=?",
            (chain, addr),
        )
        db.execute(
            "DELETE FROM telegram_contracts_unique WHERE chain=? AND contract_address=?",
            (chain, addr),
        )

    db.commit()
    remaining_gmgn = db.execute(
        "SELECT COUNT(*) FROM telegram_contracts_unique WHERE last_source LIKE 'gmgn_%'"
    ).fetchone()[0]
    print(f"  contracts_db: {remaining_gmgn} GMGN tokens remaining")
    db.close()
    return len(dead)


def cleanup_top10_db():
    """Remove 0-liq tokens from active tables in top10_tokens.db."""
    if not TOP10_DB.exists():
        print(f"  {TOP10_DB} not found, skipping")
        return 0

    db = sqlite3.connect(str(TOP10_DB))

    # Backfill liquidity from top100.json if available
    top100_path = DATA / "token_screener" / "top100.json"
    if top100_path.exists():
        top100 = json.loads(top100_path.read_text())
        for tok in top100.get("tokens", []):
            sym = tok.get("symbol", "").upper()
            fdv = tok.get("fdv") or 0
            vol = tok.get("volume_h24") or 0
            if sym and fdv > 0:
                db.execute(
                    "UPDATE current_top10 SET fdv = ?, volume_h24 = ? WHERE UPPER(symbol) = ?",
                    (fdv, vol, sym),
                )
        db.commit()

    # Find tokens with 0 or NULL FDV (actual liquidity proxy; liquidity_usd is never populated)
    bad = db.execute(
        "SELECT symbol FROM current_top10 WHERE (fdv IS NULL OR fdv <= 0) AND (volume_h24 IS NULL OR volume_h24 <= 0)"
    ).fetchall()
    bad_syms = [r[0].upper() for r in bad if r[0]]

    if not bad_syms:
        print("  top10: no zero-liq tokens")
        db.close()
        return 0

    print(f"  top10: removing {bad_syms}")

    placeholders = ",".join("?" * len(bad_syms))

    # current_top10
    db.execute(f"DELETE FROM current_top10 WHERE UPPER(symbol) IN ({placeholders})", bad_syms)

    # daily_metrics (active)
    db.execute(f"DELETE FROM daily_metrics WHERE UPPER(symbol) IN ({placeholders})", bad_syms)

    # telegram_metrics_history (active tracking)
    db.execute(
        f"DELETE FROM telegram_metrics_history WHERE UPPER(symbol) IN ({placeholders})",
        bad_syms,
    )

    db.commit()

    # Re-rank current_top10
    rows = db.execute("SELECT symbol FROM current_top10 ORDER BY score DESC").fetchall()
    for i, (sym,) in enumerate(rows, 1):
        db.execute("UPDATE current_top10 SET rank = ? WHERE symbol = ?", (i, sym))
    db.commit()

    remaining = db.execute("SELECT COUNT(*) FROM current_top10").fetchone()[0]
    print(f"  top10: {remaining} tokens remaining after cleanup")
    db.close()
    return len(bad_syms)


def cleanup_json(filename: str):
    """Remove 0-liq tokens from a JSON analysis file."""
    path = SCREENER_DIR / filename
    if not path.exists():
        return 0

    data = json.loads(path.read_text())
    before = len(data)
    cleaned = [t for t in data if (t.get("fdv") or 0) > 0 or (t.get("screener_score") or 0) > 0]

    # For twitter analysis, check if twitter_followers > 0 OR twitter_search_score > 0
    if "profile" in str(data[0]) if data else False:
        cleaned = [
            t
            for t in data
            if (
                t.get("profile", {}).get("followers", 0) > 0
                or t.get("ticker_search", {}).get("tweets_found", 0) > 0
                or (t.get("fdv") or 0) > 0
            )
        ]

    # For combined, check telegram_members > 0 OR twitter_followers > 0
    if "telegram_members" in str(data[0]) if data else False:
        cleaned = [t for t in data if (t.get("telegram_members", 0) > 0 or t.get("twitter_followers", 0) > 0)]

    removed = before - len(cleaned)
    if removed > 0:
        path.write_text(json.dumps(cleaned, indent=2))
        print(f"  {filename}: removed {removed}, {len(cleaned)} remaining")
    else:
        print(f"  {filename}: no changes")
    return removed


def main():
    print("=== Liquidity Cleanup ===")
    total = 0

    total += cleanup_contracts_db()
    total += cleanup_top10_db()
    total += cleanup_json("twitter_token_analysis.json")
    total += cleanup_json("combined_token_analysis.json")

    print(f"\nTotal tokens removed: {total}")


if __name__ == "__main__":
    main()
