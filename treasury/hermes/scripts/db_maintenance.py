#!/usr/bin/env python3
"""
Database Maintenance — Market-cap tiered pruning.

Keeps a balanced database of tokens across market cap tiers.
Each tier holds up to 1,000 tokens sorted by score.
Wallets are pruned to top performers per tier.

Tiers:
  $0 - $50K           $50K - $100K        $100K - $250K
  $250K - $500K       $500K - $750K       $750K - $1M
  $1M - $5M           $5M - $10M          $10M - $50M
  $50M - $100M        $100M+

Usage:
  python3 db_maintenance.py                   # normal run
  python3 db_maintenance.py --max-per-tier 500 # override limit
  python3 db_maintenance.py --dry-run          # don't actually delete
"""

import json
import sqlite3
import sys
import time

from hermes_screener.config import settings
from hermes_screener.logging import get_logger
from hermes_screener.metrics import start_metrics_server

DB_PATH = settings.db_path
WALLETS_DB = settings.wallets_db_path
TOP_TOKENS_PATH = settings.output_path

MAX_PER_TIER = 1000
MAX_WALLETS_PER_TIER = 500
MIN_TOKEN_AGE_DAYS = 7

log = get_logger("db_maintenance")
start_metrics_server()

# ═══════════════════════════════════════════════════════════════════════════════
# MARKET CAP TIERS
# ═══════════════════════════════════════════════════════════════════════════════

MARKET_CAP_TIERS: list[tuple[float, float, str]] = [
    (0, 50_000, "micro"),  # < $50K
    (50_000, 100_000, "tiny"),  # $50K - $100K
    (100_000, 250_000, "small_low"),  # $100K - $250K
    (250_000, 500_000, "small_mid"),  # $250K - $500K
    (500_000, 750_000, "small_high"),  # $500K - $750K
    (750_000, 1_000_000, "mid_low"),  # $750K - $1M
    (1_000_000, 5_000_000, "mid"),  # $1M - $5M
    (5_000_000, 10_000_000, "mid_high"),  # $5M - $10M
    (10_000_000, 50_000_000, "large_low"),  # $10M - $50M
    (50_000_000, 100_000_000, "large_high"),  # $50M - $100M
    (100_000_000, float("inf"), "mega"),  # $100M+
]


def get_market_cap(token: dict) -> float:
    """Extract market cap from token data. Prefers FDV over market_cap."""
    return float(
        token.get("fdv") or token.get("zerion_fdv") or token.get("market_cap") or token.get("zerion_market_cap") or 0
    )


def get_tier(market_cap: float) -> tuple[float, float, str]:
    """Return the tier (low, high, name) for a given market cap."""
    for low, high, name in MARKET_CAP_TIERS:
        if low <= market_cap < high:
            return (low, high, name)
    return MARKET_CAP_TIERS[-1]  # mega tier fallback


def classify_tokens(tokens: list[dict]) -> dict[str, list[dict]]:
    """Classify tokens into market cap tiers."""
    tiers: dict[str, list[dict]] = {name: [] for _, _, name in MARKET_CAP_TIERS}

    for token in tokens:
        mcap = get_market_cap(token)
        _, _, tier_name = get_tier(mcap)
        tiers[tier_name].append(token)

    return tiers


# ═══════════════════════════════════════════════════════════════════════════════
# TOKEN PRUNING (tiered)
# ═══════════════════════════════════════════════════════════════════════════════


def prune_contracts_tiered(max_per_tier: int, dry_run: bool = False) -> dict[str, int]:
    """
    Prune contracts by market cap tier.

    For each tier:
      1. Sort tokens by score (descending)
      2. Keep top max_per_tier tokens
      3. Remove the rest

    Returns dict of tier_name → removed_count.
    """
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    c = conn.cursor()

    # Load all contracts with scores
    c.execute("""
        SELECT tcu.chain, tcu.contract_address, tcu.channel_count,
               COALESCE(tcu.last_seen_at, 0) as last_seen
        FROM telegram_contracts_unique tcu
        ORDER BY tcu.channel_count DESC
    """)
    contracts = c.fetchall()

    # Load top100.json for enrichment data (scores, FDV)
    scored_tokens = []
    if TOP_TOKENS_PATH.exists():
        with open(TOP_TOKENS_PATH) as f:
            scored_tokens = json.load(f).get("tokens", [])

    # Build lookup: address → enrichment data
    token_lookup = {t["contract_address"]: t for t in scored_tokens}

    # Classify into tiers
    all_tokens = []
    for chain, addr, channels, last_seen in contracts:
        enrichment = token_lookup.get(addr, {})
        mcap = get_market_cap(enrichment)
        score = enrichment.get("score", 0) or 0
        _, _, tier_name = get_tier(mcap)

        all_tokens.append(
            {
                "chain": chain,
                "address": addr,
                "channels": channels,
                "last_seen": last_seen,
                "market_cap": mcap,
                "score": score,
                "tier": tier_name,
            }
        )

    # Group by tier
    tiered: dict[str, list[dict]] = {}
    for t in all_tokens:
        tier = t["tier"]
        if tier not in tiered:
            tiered[tier] = []
        tiered[tier].append(t)

    # Prune each tier
    removed = {}
    total_before = len(all_tokens)
    total_kept = 0

    for tier_name in [name for _, _, name in MARKET_CAP_TIERS]:
        tier_tokens = tiered.get(tier_name, [])
        if not tier_tokens:
            continue

        # Sort: score desc, then channel_count desc (for unscored tokens)
        tier_tokens.sort(key=lambda t: (t["score"], t["channels"]), reverse=True)

        to_keep = tier_tokens[:max_per_tier]
        to_remove = tier_tokens[max_per_tier:]

        total_kept += len(to_keep)

        if to_remove and not dry_run:
            for t in to_remove:
                c.execute(
                    "DELETE FROM telegram_contracts_unique WHERE contract_address = ?",
                    (t["address"],),
                )
                c.execute(
                    "DELETE FROM telegram_contract_calls WHERE contract_address = ?",
                    (t["address"],),
                )

        removed[tier_name] = len(to_remove)
        if len(to_remove) > 0:
            log.info(
                "tier_pruned",
                tier=tier_name,
                kept=len(to_keep),
                removed=len(to_remove),
                total=len(tier_tokens),
            )

    if not dry_run:
        conn.commit()

    conn.close()

    log.info(
        "contracts_pruned",
        before=total_before,
        kept=total_kept,
        removed=sum(removed.values()),
        tiers=len(tiered),
        dry_run=dry_run,
    )

    return removed


# ═══════════════════════════════════════════════════════════════════════════════
# WALLET PRUNING (tiered by source token market cap)
# ═══════════════════════════════════════════════════════════════════════════════


def prune_wallets_tiered(max_per_tier: int, dry_run: bool = False) -> dict[str, int]:
    """
    Prune wallets based on the market cap tier of their source tokens.

    For each tier:
      1. Find wallets that were discovered from tokens in this tier
      2. Sort by wallet_score
      3. Keep top max_per_tier wallets
      4. Remove the rest
    """
    conn = sqlite3.connect(str(WALLETS_DB), timeout=30)
    conn.execute("PRAGMA journal_mode=WAL")
    c = conn.cursor()

    # Load scored tokens for tier classification
    scored_tokens = []
    if TOP_TOKENS_PATH.exists():
        with open(TOP_TOKENS_PATH) as f:
            scored_tokens = json.load(f).get("tokens", [])
    token_lookup = {t["contract_address"]: t for t in scored_tokens}

    # Load all wallets with their source tokens
    c.execute("SELECT address, source_tokens, wallet_score FROM tracked_wallets")
    wallets = c.fetchall()

    # Classify wallets by their primary token's market cap tier
    wallet_tiers: dict[str, list[dict]] = {}
    for addr, source_json, score in wallets:
        try:
            sources = json.loads(source_json) if source_json else []
        except (json.JSONDecodeError, TypeError):
            sources = []

        # Use the highest market cap source token to determine tier
        best_mcap = 0
        for src in sources:
            src_token = token_lookup.get(src, {})
            mcap = get_market_cap(src_token)
            if mcap > best_mcap:
                best_mcap = mcap

        _, _, tier_name = get_tier(best_mcap)
        if tier_name not in wallet_tiers:
            wallet_tiers[tier_name] = []
        wallet_tiers[tier_name].append({"address": addr, "score": score or 0})

    # Prune each tier
    removed = {}
    for tier_name in [name for _, _, name in MARKET_CAP_TIERS]:
        tier_wallets = wallet_tiers.get(tier_name, [])
        if not tier_wallets:
            continue

        tier_wallets.sort(key=lambda w: w["score"], reverse=True)
        to_keep = tier_wallets[:max_per_tier]
        to_remove = tier_wallets[max_per_tier:]

        if to_remove and not dry_run:
            for w in to_remove:
                c.execute("DELETE FROM tracked_wallets WHERE address = ?", (w["address"],))
                c.execute(
                    "DELETE FROM wallet_token_entries WHERE wallet_address = ?",
                    (w["address"],),
                )

        removed[tier_name] = len(to_remove)
        if len(to_remove) > 0:
            log.info(
                "wallet_tier_pruned",
                tier=tier_name,
                kept=len(to_keep),
                removed=len(to_remove),
            )

    if not dry_run:
        conn.commit()

    conn.close()

    log.info(
        "wallets_pruned",
        removed=sum(removed.values()),
        tiers=len(wallet_tiers),
        dry_run=dry_run,
    )
    return removed


# ═══════════════════════════════════════════════════════════════════════════════
# ORPHAN CLEANUP
# ═══════════════════════════════════════════════════════════════════════════════


def clean_orphans(dry_run: bool = False) -> int:
    """Remove wallet token entries for tokens no longer in the contracts DB."""
    conn_contracts = sqlite3.connect(str(DB_PATH), timeout=30)
    c1 = conn_contracts.cursor()
    c1.execute("SELECT contract_address FROM telegram_contracts_unique")
    valid_contracts = {row[0] for row in c1.fetchall()}
    conn_contracts.close()

    conn_wallets = sqlite3.connect(str(WALLETS_DB), timeout=30)
    conn_wallets.execute("PRAGMA journal_mode=WAL")
    c2 = conn_wallets.cursor()
    c2.execute("SELECT token_address FROM wallet_token_entries")
    all_entries = c2.fetchall()

    orphans = [e[0] for e in all_entries if e[0] not in valid_contracts]

    if orphans and not dry_run:
        for addr in set(orphans):
            c2.execute("DELETE FROM wallet_token_entries WHERE token_address = ?", (addr,))
        conn_wallets.commit()

    conn_wallets.close()

    if orphans:
        log.info("orphans_cleaned", count=len(set(orphans)), dry_run=dry_run)

    return len(set(orphans))


# ═══════════════════════════════════════════════════════════════════════════════
# TIER SUMMARY REPORT
# ═══════════════════════════════════════════════════════════════════════════════


def report_tiers():
    """Print current tier distribution."""
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM telegram_contracts_unique")
    total_contracts = c.fetchone()[0]
    conn.close()

    conn_w = sqlite3.connect(str(WALLETS_DB), timeout=30)
    cw = conn_w.cursor()
    cw.execute("SELECT COUNT(*) FROM tracked_wallets")
    total_wallets = cw.fetchone()[0]
    conn_w.close()

    # Load scored tokens
    scored = []
    if TOP_TOKENS_PATH.exists():
        with open(TOP_TOKENS_PATH) as f:
            scored = json.load(f).get("tokens", [])

    tiers = classify_tokens(scored)

    log.info("=" * 65)
    log.info("TIER DISTRIBUTION")
    log.info(f"Contracts: {total_contracts} | Wallets: {total_wallets} | Scored tokens: {len(scored)}")
    log.info("-" * 65)

    for low, high, name in MARKET_CAP_TIERS:
        count = len(tiers.get(name, []))
        if count > 0 or name in ("micro", "tiny", "small_low"):
            label = (
                f"${low/1000:.0f}K-${high/1000:.0f}K"
                if high < 1_000_000
                else (
                    f"${low/1_000_000:.0f}M-${high/1_000_000:.0f}M"
                    if high < float("inf")
                    else f"${low/1_000_000:.0f}M+"
                )
            )
            log.info(f"  {name:<12} ({label:>14}): {count:>4} tokens")
    log.info("=" * 65)


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Tiered DB maintenance")
    parser.add_argument(
        "--max-per-tier",
        type=int,
        default=1000,
        help="Max tokens per market cap tier (default: 1000)",
    )
    parser.add_argument(
        "--max-wallets-per-tier",
        type=int,
        default=500,
        help="Max wallets per market cap tier (default: 500)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("DB Maintenance (Tiered) starting")
    log.info(f"Max tokens per tier: {args.max_per_tier}")
    log.info(f"Max wallets per tier: {args.max_wallets_per_tier}")
    log.info(f"Dry run: {args.dry_run}")
    log.info("=" * 60)

    start = time.time()

    # 1. Report current state
    report_tiers()

    # 2. Prune contracts by tier
    token_removed = prune_contracts_tiered(args.max_per_tier, args.dry_run)

    # 3. Prune wallets by tier
    wallet_removed = prune_wallets_tiered(args.max_wallets_per_tier, args.dry_run)

    # 4. Clean orphaned entries
    orphans = clean_orphans(args.dry_run)

    elapsed = time.time() - start

    log.info(f"Done in {elapsed:.1f}s")
    log.info(f"  Tokens removed: {sum(token_removed.values())}")
    log.info(f"  Wallets removed: {sum(wallet_removed.values())}")
    log.info(f"  Orphans cleaned: {orphans}")

    # Final report
    report_tiers()

    return 0


if __name__ == "__main__":
    sys.exit(main())
