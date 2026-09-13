#!/usr/bin/env python3
"""
Export data for GitHub Pages static site.

Run this on your server to generate JSON files for the GitHub Pages dashboard.
Then commit and push the docs/data/ folder to update the live site.

Usage:
    python3 scripts/export_github_pages.py
    cd docs && git add data/ && git commit -m "update data" && git push
"""

import json
import sqlite3
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from hermes_screener.config import settings

# Chain name mapping from Dexscreener URL paths
CHAIN_MAP = {
    "solana": "solana",
    "sol": "solana",
    "ethereum": "ethereum",
    "eth": "ethereum",
    "base": "base",
    "bsc": "BNB",
    "binance": "BNB",
    "arbitrum": "Arbitrum",
    "polygon": "Polygon",
    "avalanche": "Avalanche",
    "sui": "Sui",
}


def normalize_chain(chain: str, dex_url: str = "") -> str:
    """Normalize chain name, deriving from dex_url if needed."""
    # Try to extract chain from dex_url (https://dexscreener.com/{chain}/{addr})
    if dex_url:
        parts = dex_url.split("/")
        if len(parts) >= 4 and "dexscreener.com" in dex_url:
            url_chain = parts[3].lower()
            if url_chain in CHAIN_MAP:
                return CHAIN_MAP[url_chain]

    # Fall back to chain field
    chain_lower = (chain or "").lower()
    return CHAIN_MAP.get(chain_lower, chain or "unknown")


MCAP_TIERS = [
    (0, 50_000, "< $50K"),
    (50_000, 250_000, "$50K - $250K"),
    (250_000, 1_000_000, "$250K - $1M"),
    (1_000_000, 10_000_000, "$1M - $10M"),
    (10_000_000, 100_000_000, "$10M - $100M"),
    (100_000_000, float("inf"), "$100M+"),
]


def mcap_tier_label(fdv: float) -> str:
    """Return market cap tier label for a given FDV."""
    for low, high, label in MCAP_TIERS:
        if low <= (fdv or 0) < high:
            return label
    return "< $50K"


def mcap_tier_key(fdv: float) -> int:
    """Return sort key for market cap tier."""
    for i, (low, high, _) in enumerate(MCAP_TIERS):
        if low <= (fdv or 0) < high:
            return i
    return 0


DOCS_DATA = Path(__file__).parent.parent / "docs" / "data"


def export_tokens():
    """Export top100.json for GitHub Pages."""
    # Prefer the latest top100.json over stale phase files
    data_dir = settings.output_path.parent
    candidates = [
        settings.output_path,
        data_dir / "top100_phase4_social.json",
        data_dir / "top100_phase3_smartmoney.json",
        data_dir / "top100_phase1_initial.json",
    ]

    data = None
    for src in candidates:
        if src.exists():
            with open(src) as f:
                raw = json.load(f)
            # Check if it has the enriched format (contract_address field)
            tokens = raw.get("tokens") or raw.get("top_tokens") or []
            if tokens and (tokens[0].get("contract_address") or tokens[0].get("address")):
                data = raw
                print(f"Using enriched data from {src.name}")
                break

    if not data:
        print("No enriched token data found, creating empty data")
        data = {
            "tokens": [],
            "generated_at_iso": "No data available",
            "total_candidates": 0,
        }

    # Handle both "tokens" and "top_tokens" key names
    tokens = data.get("tokens") or data.get("top_tokens") or []
    data["tokens"] = tokens

    # Normalize chains and clean up data
    clean_tokens = []
    for token in tokens:
        token["chain"] = normalize_chain(token.get("chain", ""), token.get("dex_url", ""))
        # Normalize address field names
        if "contract_address" not in token and "address" in token:
            token["contract_address"] = token["address"]
        # Flatten dex sub-object to top level for frontend
        dex = token.get("dex", {})
        chain_norm = token.get("chain", "unknown")
        addr = token.get("contract_address", "")
        if dex:
            token["fdv"] = token.get("fdv") or dex.get("fdv") or dex.get("market_cap") or 0
            token["symbol"] = token.get("symbol") or dex.get("symbol") or ""
            token["name"] = token.get("name") or dex.get("name") or ""
            token["volume_h24"] = dex.get("volume_h24", 0) or 0
            token["volume_h1"] = dex.get("volume_h1", 0) or 0
            token["price_change_h1"] = dex.get("price_change_h1")
            token["price_change_h6"] = dex.get("price_change_h6")
            token["age_hours"] = dex.get("age_hours")
            token["dex_name"] = dex.get("dex", "")
        # Always set dex_url - use Dexscreener
        if not token.get("dex_url") and addr and chain_norm != "unknown":
            token["dex_url"] = f"https://dexscreener.com/{chain_norm.lower()}/{addr}"
        for key in list(token.keys()):
            if isinstance(token[key], set):
                token[key] = list(token[key])
        clean_tokens.append(token)

    # Deduplicate by contract_address to prevent duplicates in static export
    def _dedupe(tokens_list):
        seen = set()
        unique = []
        for t in tokens_list:
            addr = (t.get("contract_address") or "").lower()
            if addr and addr not in seen:
                seen.add(addr)
                unique.append(t)
        return unique

    clean_tokens = _dedupe(clean_tokens)

    # Prioritize: high score + high volume + no negative signals = top
    def token_sort_key(t):
        score = t.get("score", 0) or 0
        vol = t.get("volume_h24", 0) or 0
        negs = t.get("negatives", [])
        pc_h1 = t.get("price_change_h1")

        # Penalty count from negative signals
        bad_signals = sum(
            1
            for bad in [
                "DEAD",
                "death spiral",
                "ONLY SELLS",
                "on bonding curve",
                "HEAVY SELLS",
                "stagnant volume",
                "no volume",
                "decline h1",
                "declining h6",
                "collapsed h24",
                "down h24",
                "steep decline",
                "CRASH",
            ]
            if bad in str(negs)
        )

        # Volume multiplier: $100K=1x, $1M=2x, $10M=3x (linear in log)
        vol_mult = min(vol / 500000, 3.0)  # $500K=1x, cap at 3x  # normalize so $1M = 1.0

        # Penalty for no price data
        stale_mult = 0.3 if pc_h1 is None else 1.0

        # Composite: heavily weight volume alongside score
        return score * vol_mult * stale_mult / (1 + bad_signals * 2)

    clean_tokens.sort(key=token_sort_key, reverse=True)
    data["tokens"] = clean_tokens

    dst = DOCS_DATA / "tokens.json"
    with open(dst, "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"Exported {len(data.get('tokens', []))} tokens to {dst}")


def export_wallets():
    """Export top wallets for GitHub Pages with market cap tier classification."""
    from datetime import datetime, timezone

    db_path = settings.wallets_db_path
    if not db_path.exists():
        print(f"WARNING: {db_path} not found, creating empty data")
        data = {"wallets": [], "generated_at_iso": "No data available"}
    else:
        # Load token data for FDV-based tier classification
        data_dir = settings.output_path.parent
        candidates = [
            data_dir / "top100_phase4_social.json",
            data_dir / "top100_phase3_smartmoney.json",
            data_dir / "top100_phase1_initial.json",
            settings.output_path,
        ]
        token_fdv = {}
        for src in candidates:
            if src.exists():
                with open(src) as f:
                    raw = json.load(f)
                toks = raw.get("tokens") or raw.get("top_tokens") or []
                if toks and toks[0].get("contract_address"):
                    for t in toks:
                        addr = t.get("contract_address", "")
                        if addr:
                            fdv = t.get("fdv") or t.get("market_cap") or 0
                            t_chain = normalize_chain(t.get("chain", ""), t.get("dex_url", ""))
                            token_fdv[addr] = {"fdv": fdv, "chain": t_chain}
                    break

        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                "SELECT * FROM tracked_wallets WHERE wallet_score > 0 " "ORDER BY wallet_score DESC LIMIT 200"
            ).fetchall()
            wallets = [dict(r) for r in rows]

            # Enrich each wallet with avg_fdv and mcap_tier
            for w in wallets:
                w_addr = w.get("address", "")
                # Get tokens this wallet has traded
                held_rows = conn.execute(
                    "SELECT token_address FROM wallet_token_entries "
                    "WHERE wallet_address = ? AND token_address IS NOT NULL",
                    (w_addr,),
                ).fetchall()
                held_fdvs = []
                held_chains = set()
                for r in held_rows:
                    t_addr = r[0]
                    if t_addr and t_addr in token_fdv:
                        held_fdvs.append(token_fdv[t_addr]["fdv"])
                        c = token_fdv[t_addr]["chain"]
                        if c and c != "unknown":
                            held_chains.add(c)

                avg_fdv = sum(held_fdvs) / len(held_fdvs) if held_fdvs else 0
                w["avg_fdv"] = round(avg_fdv)
                w["mcap_tier"] = mcap_tier_label(avg_fdv)
                # Normalize chain
                w["chain"] = normalize_chain(w.get("chain", ""))
                if w["chain"] == "unknown" and held_chains:
                    w["chain"] = sorted(held_chains)[0]

            # Sort: prioritize by mcap_tier buckets first, then by composite score within each
            # This groups wallets by market cap range for better browsing
            wallets.sort(
                key=lambda w: (
                    mcap_tier_key(w.get("avg_fdv", 0)),
                    -(
                        (max(0.1, w.get("win_rate", 0) or 0))
                        * (1 + min(w.get("avg_roi", 0) or 0, 10))
                        * min(w.get("total_trades", 0), 100)
                    ),
                ),
            )
        except Exception as e:
            print(f"ERROR reading wallets: {e}")
            wallets = []
        finally:
            conn.close()

        data = {
            "wallets": wallets,
            "generated_at_iso": datetime.now(timezone.utc).isoformat(),
        }

    dst = DOCS_DATA / "wallets.json"
    with open(dst, "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"Exported {len(data.get('wallets', []))} wallets to {dst}")


def export_cross_tokens():
    """Export tokens ranked by wallet count for GitHub Pages."""
    # Load tokens from enriched data source - use file with most tokens
    data_dir = settings.output_path.parent
    candidates = [
        data_dir / "top100.json",
        data_dir / "top100_phase4_social.json",
        data_dir / "top100_phase3_smartmoney.json",
        data_dir / "top100_phase1_initial.json",
    ]

    tokens = []
    best_count = 0
    for src in candidates:
        if src.exists():
            with open(src) as f:
                raw = json.load(f)
            candidate_tokens = raw.get("tokens") or raw.get("top_tokens") or []
            valid = [t for t in candidate_tokens if t.get("contract_address")]
            if len(valid) > best_count:
                tokens = valid
                best_count = len(valid)

    if not tokens:
        print("No enriched token data, skipping cross-tokens")
        return
    print(f"Cross-tokens: using {best_count} enriched tokens")

    # Deduplicate before processing
    def _dedupe(tokens_list):
        seen = set()
        unique = []
        for t in tokens_list:
            addr = (t.get("contract_address") or "").lower()
            if addr and addr not in seen:
                seen.add(addr)
                unique.append(t)
        return unique

    tokens = _dedupe(tokens)

    # Flatten dex sub-objects for all tokens
    for token in tokens:
        dex = token.get("dex", {})
        chain = normalize_chain(token.get("chain", ""), token.get("dex_url", ""))
        addr = token.get("contract_address", "")
        if dex:
            token["symbol"] = token.get("symbol") or dex.get("symbol") or ""
            token["fdv"] = token.get("fdv") or dex.get("fdv") or dex.get("market_cap") or 0
            token["volume_h24"] = dex.get("volume_h24", 0) or 0
            token["volume_h1"] = dex.get("volume_h1", 0) or 0
            token["price_change_h1"] = dex.get("price_change_h1")
            token["price_change_h6"] = dex.get("price_change_h6")
            token["age_hours"] = dex.get("age_hours")
        if not token.get("dex_url") and addr and chain != "unknown":
            token["dex_url"] = f"https://dexscreener.com/{chain.lower()}/{addr}"
        token["chain"] = chain

    # Get wallet holdings
    db_path = settings.wallets_db_path
    if not db_path.exists():
        print("No wallet DB, exporting tokens without cross-reference")
        for t in tokens:
            t["wallet_count"] = 0
            t["holding_wallets"] = []
    else:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        try:
            # Get top wallets
            top_wallets = conn.execute(
                "SELECT address FROM tracked_wallets WHERE wallet_score > 0 " "ORDER BY wallet_score DESC LIMIT 200"
            ).fetchall()
            wallet_addrs = [r[0] for r in top_wallets]

            # Get holdings for each wallet
            wallet_holdings = {}  # token_addr -> set of wallet_addrs
            for w_addr in wallet_addrs:
                rows = conn.execute(
                    "SELECT DISTINCT token_address FROM wallet_token_entries "
                    "WHERE wallet_address = ? AND token_address IS NOT NULL",
                    (w_addr,),
                ).fetchall()
                for r in rows:
                    t_addr = r[0]
                    if t_addr:
                        if t_addr not in wallet_holdings:
                            wallet_holdings[t_addr] = []
                        wallet_holdings[t_addr].append(w_addr)

            # Annotate tokens
            for t in tokens:
                t_addr = t.get("contract_address", "")
                t["wallet_count"] = len(wallet_holdings.get(t_addr, []))
                t["holding_wallets"] = wallet_holdings.get(t_addr, [])[:10]
                t["chain"] = normalize_chain(t.get("chain", ""), t.get("dex_url", ""))
                fdv = t.get("fdv") or t.get("market_cap") or 0
                t["mcap_tier"] = mcap_tier_label(fdv)
        finally:
            conn.close()

    # Prioritize: high score + high volume + wallet count + no negative signals
    def cross_token_sort(t):
        score = t.get("score", 0) or 0
        vol = t.get("volume_h24", 0) or 0
        wallets = t.get("wallet_count", 0)
        negs = t.get("negatives", [])
        pc_h1 = t.get("price_change_h1")
        bad_signals = sum(
            1
            for bad in [
                "DEAD",
                "death spiral",
                "ONLY SELLS",
                "on bonding curve",
                "HEAVY SELLS",
                "stagnant volume",
                "no volume",
                "decline h1",
                "declining h6",
                "collapsed h24",
                "down h24",
                "steep decline",
                "CRASH",
            ]
            if bad in str(negs)
        )
        vol_mult = min(vol / 500000, 3.0)  # $500K=1x, cap at 3x
        stale_mult = 0.3 if pc_h1 is None else 1.0
        return score * vol_mult * stale_mult * (1 + wallets * 0.3) / (1 + bad_signals * 2)

    tokens.sort(key=cross_token_sort, reverse=True)

    # Convert sets to lists
    for t in tokens:
        for key in list(t.keys()):
            if isinstance(t[key], set):
                t[key] = list(t[key])

    dst = DOCS_DATA / "cross-tokens.json"
    with open(dst, "w") as f:
        json.dump(tokens, f, indent=2, default=str)
    print(f"Exported {len(tokens)} cross-referenced tokens to {dst}")


def export_cross_wallets():
    """Export wallets ranked by top token count for GitHub Pages."""
    # Load tokens from enriched data source - use file with most tokens
    data_dir = settings.output_path.parent
    candidates = [
        data_dir / "top100.json",
        data_dir / "top100_phase4_social.json",
        data_dir / "top100_phase3_smartmoney.json",
        data_dir / "top100_phase1_initial.json",
    ]

    tokens = []
    best_count = 0
    for src in candidates:
        if src.exists():
            with open(src) as f:
                raw = json.load(f)
            candidate_tokens = raw.get("tokens") or raw.get("top_tokens") or []
            valid = [t for t in candidate_tokens if t.get("contract_address")]
            if len(valid) > best_count:
                tokens = valid
                best_count = len(valid)

    if not tokens:
        print("No enriched token data, skipping cross-wallets")
        return
    print(f"Cross-wallets: using {best_count} enriched tokens")

    # Flatten dex sub-objects for symbol lookup
    for token in tokens:
        dex = token.get("dex", {})
        chain = normalize_chain(token.get("chain", ""), token.get("dex_url", ""))
        addr = token.get("contract_address", "")
        if dex and not token.get("symbol"):
            token["symbol"] = dex.get("symbol") or ""
            token["fdv"] = dex.get("fdv") or dex.get("market_cap") or 0
        if not token.get("dex_url") and addr and chain != "unknown":
            token["dex_url"] = f"https://dexscreener.com/{chain.lower()}/{addr}"
        token["chain"] = chain

    top_token_addrs = {t.get("contract_address", "") for t in tokens if t.get("contract_address")}
    # Build token FDV lookup for wallet tier classification
    token_fdv = {}
    for t in tokens:
        addr = t.get("contract_address", "")
        if addr:
            fdv = t.get("fdv") or t.get("market_cap") or 0
            token_chain = normalize_chain(t.get("chain", ""), t.get("dex_url", ""))
            token_fdv[addr] = {"fdv": fdv, "chain": token_chain}

    # Get wallets
    db_path = settings.wallets_db_path
    if not db_path.exists():
        print("No wallet DB, skipping cross-wallets")
        return

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        top_wallets = conn.execute(
            "SELECT * FROM tracked_wallets "
            "WHERE wallet_score > 0 AND total_trades > 1 "
            "ORDER BY wallet_score DESC LIMIT 500"
        ).fetchall()

        wallet_results = []
        for w in top_wallets:
            w_addr = w["address"]
            rows = conn.execute(
                "SELECT DISTINCT token_address FROM wallet_token_entries "
                "WHERE wallet_address = ? AND token_address IS NOT NULL",
                (w_addr,),
            ).fetchall()
            held_set = {r[0] for r in rows if r[0]}
            overlap = held_set & top_token_addrs

            # Get symbols and FDVs of held tokens
            held_symbols = []
            held_fdvs = []
            held_chains = set()
            for t in tokens:
                if t.get("contract_address") in overlap:
                    held_symbols.append(t.get("symbol", "?"))
                    fdv = t.get("fdv") or t.get("market_cap") or 0
                    held_fdvs.append(fdv)
                    t_chain = normalize_chain(t.get("chain", ""), t.get("dex_url", ""))
                    if t_chain != "unknown":
                        held_chains.add(t_chain)

            # Average FDV -> market cap tier
            avg_fdv = sum(held_fdvs) / len(held_fdvs) if held_fdvs else 0

            # Include ALL wallet fields
            result = dict(w)
            result["top_token_count"] = len(overlap)
            result["top_tokens"] = held_symbols[:10]
            result["avg_fdv"] = round(avg_fdv)
            result["mcap_tier"] = mcap_tier_label(avg_fdv)
            # Use token chain if wallet chain is unknown
            if not result.get("chain") and held_chains:
                result["chain"] = sorted(held_chains)[0]
            wallet_results.append(result)
    finally:
        conn.close()

    # Sort by composite score weighted heavily by top_token_count
    # Wallets holding more top tokens = higher priority
    def wallet_sort_key(w):
        tc = w.get("top_token_count", 0)
        wr = max(0.1, w.get("win_rate", 0) or 0)
        roi = w.get("avg_roi", 0) or 0
        trades = w.get("total_trades", 0)
        # Heavy weight on token count: tc^2 rewards holding many top tokens
        # Then multiply by quality signals (win rate, ROI)
        composite = (tc**1.5) * wr * (1 + min(roi, 5)) * min(trades / 10, 10)
        return (round(composite, 2), tc, w.get("wallet_score", 0))

    wallet_results.sort(key=wallet_sort_key, reverse=True)

    dst = DOCS_DATA / "cross-wallets.json"
    with open(dst, "w") as f:
        json.dump(wallet_results, f, indent=2, default=str)
    print(f"Exported {len(wallet_results)} cross-referenced wallets to {dst}")


def export_tiered_wallets():
    """Export tokens and wallets grouped by market cap tiers for GitHub Pages."""
    from datetime import datetime, timezone

    MARKET_CAP_TIERS = [
        (0, 50_000, "micro", "$0 - $50K"),
        (50_000, 100_000, "tiny", "$50K - $100K"),
        (100_000, 250_000, "small_low", "$100K - $250K"),
        (250_000, 500_000, "small_mid", "$250K - $500K"),
        (500_000, 750_000, "small_high", "$500K - $750K"),
        (750_000, 1_000_000, "mid_low", "$750K - $1M"),
        (1_000_000, 5_000_000, "mid", "$1M - $5M"),
        (5_000_000, 10_000_000, "mid_high", "$5M - $10M"),
        (10_000_000, 50_000_000, "large_low", "$10M - $50M"),
        (50_000_000, 100_000_000, "large_high", "$50M - $100M"),
        (100_000_000, float("inf"), "mega", "$100M+"),
    ]
    tier_order = [name for _, _, name, _ in MARKET_CAP_TIERS]

    def get_market_cap(token):
        return float(token.get("fdv") or token.get("market_cap") or 0)

    def get_tier(mcap):
        for low, high, name, label in MARKET_CAP_TIERS:
            if low <= mcap < high:
                return name, label
        return "mega", "$100M+"

    # Load tokens from enriched data source (same pattern as cross exports)
    data_dir = settings.output_path.parent
    candidates = [
        data_dir / "top100_phase4_social.json",
        data_dir / "top100_phase3_smartmoney.json",
        data_dir / "top100_phase1_initial.json",
        settings.output_path,
    ]

    tokens = []
    for src in candidates:
        if src.exists():
            with open(src) as f:
                raw = json.load(f)
            candidate_tokens = raw.get("tokens") or raw.get("top_tokens") or []
            if candidate_tokens and candidate_tokens[0].get("contract_address"):
                tokens = candidate_tokens
                print(f"Tiered: using {src.name}")
                break

    if not tokens:
        print("No token data, skipping tiered wallets")
        return

    # Classify tokens by tier
    tiered_tokens = {name: [] for name in tier_order}
    tier_labels = {name: label for _, _, name, label in MARKET_CAP_TIERS}

    for t in tokens:
        mcap = get_market_cap(t)
        tier_name, _ = get_tier(mcap)
        tiered_tokens[tier_name].append(t)

    # Sort tokens within each tier by score desc
    for name in tier_order:
        tiered_tokens[name].sort(key=lambda t: t.get("score", 0) or 0, reverse=True)

    # Build wallet mapping per tier
    db_path = settings.wallets_db_path
    tiered_data = {}
    tier_order_out = []

    for tier_name in tier_order:
        tier_token_list = tiered_tokens[tier_name]
        if not tier_token_list:
            continue

        tier_token_addrs = {t.get("contract_address", "") for t in tier_token_list if t.get("contract_address")}
        tier_wallets = []

        if db_path.exists():
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            try:
                placeholders = ",".join("?" * len(tier_token_addrs))
                rows = conn.execute(
                    f"""
                    SELECT DISTINCT w.address, w.chain, w.wallet_score,
                           w.total_profit, w.win_rate, w.avg_roi, w.total_trades,
                           w.wallet_tags
                    FROM tracked_wallets w
                    JOIN wallet_token_entries e ON w.address = e.wallet_address
                    WHERE e.token_address IN ({placeholders})
                      AND w.wallet_score > 0
                    ORDER BY w.wallet_score DESC
                    LIMIT 100
                """,
                    list(tier_token_addrs),
                ).fetchall()

                for w in rows:
                    held_rows = conn.execute(
                        "SELECT token_address FROM wallet_token_entries "
                        "WHERE wallet_address = ? AND token_address IN (" + placeholders + ")",
                        [w["address"]] + list(tier_token_addrs),
                    ).fetchall()
                    held_in_tier = [r[0] for r in held_rows]

                    tier_wallets.append(
                        {
                            "address": w["address"],
                            "chain": w["chain"],
                            "wallet_score": w["wallet_score"],
                            "total_profit": w["total_profit"],
                            "win_rate": w["win_rate"],
                            "avg_roi": w["avg_roi"],
                            "trade_count": w["total_trades"],
                            "wallet_tags": w["wallet_tags"],
                            "tokens_held": len(held_in_tier),
                            "token_addresses": held_in_tier[:5],
                        }
                    )
            except Exception as e:
                print(f"ERROR reading tier {tier_name} wallets: {e}")
            finally:
                conn.close()

        # Convert sets to lists in tokens
        clean_tokens = []
        for t in tier_token_list:
            ct = dict(t)
            for key in list(ct.keys()):
                if isinstance(ct[key], set):
                    ct[key] = list(ct[key])
            clean_tokens.append(ct)

        tiered_data[tier_name] = {
            "label": tier_labels[tier_name],
            "token_count": len(clean_tokens),
            "wallet_count": len(tier_wallets),
            "tokens": clean_tokens,
            "wallets": tier_wallets,
        }
        tier_order_out.append(tier_name)

    output = {
        "generated_at_iso": datetime.now(timezone.utc).isoformat(),
        "tier_order": tier_order_out,
        "tiers": tiered_data,
    }

    dst = DOCS_DATA / "tiered-wallets.json"
    with open(dst, "w") as f:
        json.dump(output, f, indent=2, default=str)
    print(f"Exported tiered wallets ({len(tier_order_out)} tiers) to {dst}")


def export_smart_money():
    """Export enriched smart money tokens and wallets for GitHub Pages."""
    from datetime import datetime, timezone

    db_path = settings.wallets_db_path
    if not db_path.exists():
        print("No wallet DB, skipping smart money export")
        return

    # Load enriched token data for SM token matching - use file with most tokens
    enriched_lookup = {}
    data_dir = settings.output_path.parent
    best_count = 0
    for src in [
        data_dir / "top100.json",
        data_dir / "top100_phase4_social.json",
        data_dir / "top100_phase3_smartmoney.json",
        data_dir / "top100_phase1_initial.json",
    ]:
        if src.exists():
            with open(src) as f:
                raw = json.load(f)
            candidate = {}
            for t in raw.get("tokens") or raw.get("top_tokens") or []:
                addr = t.get("contract_address", "")
                if addr:
                    candidate[addr] = t
            if len(candidate) > best_count:
                enriched_lookup = candidate
                best_count = len(candidate)
    if enriched_lookup:
        print(f"SM export: using enriched data ({best_count} tokens)")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        # ── Export SM tokens enriched with pipeline data ──
        BLOCKED_SM_SYMBOLS = {
            "wsol",
            "weth",
            "usdc",
            "usdt",
            "dai",
            "busd",
            "wbtc",
            "steth",
        }
        sm_token_rows = conn.execute(
            """
            SELECT t.token_address, t.chain, t.symbol, t.buyer_count,
                   t.total_buy_usd, t.avg_buy_usd, t.top_buyer_score,
                   t.first_seen_at, t.discovery_wallets, t.score as sm_score
            FROM smart_money_tokens t
            WHERE t.buyer_count >= 2
            ORDER BY t.buyer_count DESC, t.total_buy_usd DESC
            LIMIT 200
        """
        ).fetchall()

        tokens = []
        for r in sm_token_rows:
            chain = normalize_chain(r["chain"] or "")
            addr = r["token_address"]
            enriched = enriched_lookup.get(addr, {})

            # Merge enriched data with SM data
            dex_data = enriched.get("dex", {})
            fdv = dex_data.get("fdv") or enriched.get("fdv") or enriched.get("market_cap") or 0
            score = enriched.get("score", 0) or r["sm_score"] or 0
            symbol = dex_data.get("symbol") or enriched.get("symbol") or r["symbol"] or ""

            # Filter out wrapped/stable tokens
            if symbol.lower().strip() in BLOCKED_SM_SYMBOLS:
                continue

            try:
                wallet_list = json.loads(r["discovery_wallets"] or "[]")
            except (json.JSONDecodeError, TypeError):
                wallet_list = []

            tokens.append(
                {
                    "token_address": addr,
                    "chain": chain,
                    "symbol": symbol,
                    "buyer_count": r["buyer_count"] or 0,
                    "total_buy_usd": r["total_buy_usd"] or 0,
                    "avg_buy_usd": r["avg_buy_usd"] or 0,
                    "top_buyer_score": r["top_buyer_score"] or 0,
                    # Enriched fields
                    "fdv": fdv,
                    "score": score,
                    "volume_h24": dex_data.get("volume_h24", 0) or 0,
                    "volume_h1": dex_data.get("volume_h1", 0) or 0,
                    "price_change_h1": dex_data.get("price_change_h1"),
                    "price_change_h6": dex_data.get("price_change_h6"),
                    "age_hours": dex_data.get("age_hours"),
                    "dex_url": enriched.get("dex_url", "") or f"https://dexscreener.com/{chain.lower()}/{addr}",
                    "positives": enriched.get("positives", []),
                    "gmgn_smart_wallets": enriched.get("gmgn_smart_wallets", 0),
                    # Computed
                    "mcap_tier": mcap_tier_label(fdv),
                    "buyer_wallets": wallet_list[:5],
                }
            )

        # Sort by composite: buyer_count * score * (1 + total_usd/1000)
        tokens.sort(
            key=lambda t: (t["buyer_count"] or 0) * max(0.1, t["score"] or 0) * (1 + (t["total_buy_usd"] or 0) / 1000),
            reverse=True,
        )

        dst = DOCS_DATA / "smart-money-tokens.json"
        with open(dst, "w") as f:
            json.dump(
                {
                    "tokens": tokens,
                    "generated_at_iso": datetime.now(timezone.utc).isoformat(),
                },
                f,
                indent=2,
                default=str,
            )
        print(f"Exported {len(tokens)} enriched smart money tokens to {dst}")

        # ── Export SM wallets (wallets from smart_money_purchases) ──
        # Get unique wallets that bought SM tokens
        sm_wallet_rows = conn.execute(
            """
            SELECT p.wallet_address, p.chain,
                   MAX(p.wallet_score) as wallet_score,
                   COUNT(DISTINCT p.token_address) as sm_token_count,
                   GROUP_CONCAT(DISTINCT p.token_symbol) as sm_symbols
            FROM smart_money_purchases p
            WHERE p.side = 'buy'
            GROUP BY p.wallet_address
            HAVING sm_token_count >= 1
            ORDER BY wallet_score DESC, sm_token_count DESC
            LIMIT 200
        """
        ).fetchall()

        # Load enriched token data for FDV lookup
        token_fdv = {}
        for t in tokens if "tokens" in dir() else []:
            addr = t.get("token_address") or t.get("contract_address", "")
            if addr:
                token_fdv[addr] = t.get("fdv", 0)

        wallets = []
        for w in sm_wallet_rows:
            w_addr = w["wallet_address"]
            # Get full wallet details from tracked_wallets
            tw = conn.execute(
                "SELECT total_profit, win_rate, avg_roi, total_trades, wallet_tags, "
                "avg_hold_hours, insider_flag, copy_trade_flag, realized_pnl, "
                "unrealized_pnl, buy_count, sell_count, rug_history_count, "
                "trading_pattern, first_seen_at, last_active_at "
                "FROM tracked_wallets WHERE address = ?",
                (w_addr,),
            ).fetchone()

            # Get SM tokens this wallet bought with FDV
            bought = conn.execute(
                """
                SELECT p.token_address, p.token_symbol FROM smart_money_purchases p
                WHERE p.wallet_address = ? AND p.side = 'buy'
                GROUP BY p.token_address
            """,
                (w_addr,),
            ).fetchall()
            held_symbols = [r[1] for r in bought if r[1]]
            held_fdvs = [token_fdv.get(r[0], 0) for r in bought]
            avg_fdv = sum(held_fdvs) / len(held_fdvs) if held_fdvs else 0

            chain = normalize_chain(w["chain"] or "")
            wallets.append(
                {
                    "address": w_addr,
                    "chain": chain,
                    "wallet_score": w["wallet_score"] or 0,
                    "total_profit": tw["total_profit"] if tw else 0,
                    "win_rate": tw["win_rate"] if tw else 0,
                    "avg_roi": tw["avg_roi"] if tw else 0,
                    "total_trades": tw["total_trades"] if tw else 0,
                    "wallet_tags": tw["wallet_tags"] if tw else "",
                    "avg_hold_hours": tw["avg_hold_hours"] if tw else 0,
                    "insider_flag": tw["insider_flag"] if tw else 0,
                    "copy_trade_flag": tw["copy_trade_flag"] if tw else 0,
                    "realized_pnl": tw["realized_pnl"] if tw else 0,
                    "rug_history_count": tw["rug_history_count"] if tw else 0,
                    "trading_pattern": tw["trading_pattern"] if tw else "",
                    "sm_tokens_held": w["sm_token_count"] or 0,
                    "top_tokens": held_symbols[:10],
                    "avg_fdv": round(avg_fdv),
                    "mcap_tier": mcap_tier_label(avg_fdv),
                }
            )

            # Sort by composite: score * sm_tokens_held
            wallets.sort(
                key=lambda w: (w["wallet_score"] or 0) * max(1, w["sm_tokens_held"]),
                reverse=True,
            )

            dst = DOCS_DATA / "smart-money-wallets.json"
            with open(dst, "w") as f:
                json.dump(
                    {
                        "wallets": wallets,
                        "generated_at_iso": datetime.now(timezone.utc).isoformat(),
                    },
                    f,
                    indent=2,
                    default=str,
                )
            print(f"Exported {len(wallets)} smart money wallets to {dst}")

        # ── Export recent purchases ──
        purchase_rows = conn.execute(
            """
            SELECT p.wallet_address, p.chain, p.token_address, p.token_symbol,
                   p.amount_usd, p.price_usd, p.timestamp, p.wallet_score, p.wallet_tags
            FROM smart_money_purchases p
            WHERE p.side = 'buy'
            ORDER BY p.timestamp DESC
            LIMIT 1000
        """
        ).fetchall()

        purchases = [
            {
                "wallet": r["wallet_address"],
                "chain": normalize_chain(r["chain"] or ""),
                "token_address": r["token_address"],
                "symbol": r["token_symbol"] or "",
                "amount_usd": r["amount_usd"] or 0,
                "price_usd": r["price_usd"] or 0,
                "timestamp": r["timestamp"] or 0,
                "wallet_score": r["wallet_score"] or 0,
                "wallet_tags": r["wallet_tags"] or "",
            }
            for r in purchase_rows
        ]

        dst = DOCS_DATA / "smart-money-purchases.json"
        with open(dst, "w") as f:
            json.dump(
                {
                    "purchases": purchases,
                    "generated_at_iso": datetime.now(timezone.utc).isoformat(),
                },
                f,
                indent=2,
                default=str,
            )
        print(f"Exported {len(purchases)} smart money purchases to {dst}")

    except Exception as e:
        print(f"ERROR in smart money export: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    print("Exporting data for GitHub Pages...")
    DOCS_DATA.mkdir(parents=True, exist_ok=True)
    export_tokens()
    export_wallets()
    export_cross_tokens()
    export_cross_wallets()
    export_tiered_wallets()
    export_smart_money()
    print("\nDone! Now commit and push the docs/data/ folder:")
    print("  cd /path/to/hermes-token-screener")
    print("  git add docs/data/")
    print("  git commit -m 'update site data'")
    print("  git push")
