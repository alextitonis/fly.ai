"""
Iterative Cross-Scoring — re-sorts tokens and wallets based on each other.

Phase 1: Wallet tracker finds top wallets from token holders (existing)
Phase 2: Re-score TOKENS based on how many top wallets hold them
Phase 3: Re-score WALLETS based on how many top tokens they hold
Phase 4: Write final sorted output

This creates a feedback loop: good wallets → good tokens → better wallet ranking.

Usage:
    python3 cross_scoring.py                    # full pipeline
    python3 cross_scoring.py --min-wallet-score 30   # only use wallets scoring 30+
    python3 cross_scoring.py --iterations 2     # run the feedback loop twice
"""

from __future__ import annotations

import json
import sqlite3
import sys
import time
from typing import Any

# Import enhanced scoring
from revised_enhanced_scoring import revised_compute_enhanced_token_score

from hermes_screener.config import settings
from hermes_screener.logging import get_logger

log = get_logger("cross_scoring")

DB_PATH = settings.db_path
WALLETS_DB = settings.wallets_db_path
OUTPUT_PATH = settings.output_path

# Phase output paths
DATA_DIR = settings.hermes_home / "data"
PHASE1_OUTPUT = DATA_DIR / "token_screener" / "top100_phase1_initial.json"
PHASE3_OUTPUT = DATA_DIR / "token_screener" / "top100_phase3_smartmoney.json"


# ═══════════════════════════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════════════════════════


def load_tokens() -> list[dict]:
    """Load current token scores from top100.json."""
    if not OUTPUT_PATH.exists():
        log.error("top100_not_found", path=str(OUTPUT_PATH))
        return []
    with open(OUTPUT_PATH) as f:
        data = json.load(f)
    return data.get("tokens", data.get("top_tokens", []))


def load_wallets(min_score: float = 30) -> list[dict]:
    """Load top wallets from wallet_tracker.db."""
    conn = sqlite3.connect(f"file:{WALLETS_DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM tracked_wallets WHERE wallet_score >= ? ORDER BY wallet_score DESC",
        (min_score,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def load_wallet_token_map() -> dict[str, list[dict]]:
    """Load wallet → token entries mapping."""
    conn = sqlite3.connect(f"file:{WALLETS_DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM wallet_token_entries").fetchall()
    conn.close()

    mapping: dict[str, list[dict]] = {}
    for r in rows:
        d = dict(r)
        addr = d["wallet_address"]
        if addr not in mapping:
            mapping[addr] = []
        mapping[addr].append(d)
    return mapping


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: RE-SCORE TOKENS (based on smart money presence)
# ═══════════════════════════════════════════════════════════════════════════════


def rescore_tokens(
    tokens: list[dict],
    wallets: list[dict],
    wallet_token_map: dict[str, list[dict]],
) -> list[dict]:
    """Re-score tokens based on smart money presence + all enrichment data."""

    # Build token → smart wallet mapping
    token_wallets: dict[str, list[dict]] = {}
    {w["address"]: w for w in wallets}

    for wallet in wallets:
        w_addr = wallet["address"]
        entries = wallet_token_map.get(w_addr, [])
        for entry in entries:
            t_addr = entry["token_address"]
            if t_addr not in token_wallets:
                token_wallets[t_addr] = []
            token_wallets[t_addr].append(wallet)

    # Compute stats for normalization
    max_smart_wallets = max((len(ws) for ws in token_wallets.values()), default=1)

    # Component-weighted wallet scoring: prioritize PnL + timing + winrate over social/age
    def _component_score(w: dict) -> float:
        return (
            w.get("pnl_score", 0) * 1.0
            + w.get("timing_score", 0) * 1.0
            + w.get("winrate_score", 0) * 0.8
            + w.get("trades_score", 0) * 0.5
            + w.get("insider_score", 0) * 0.7
            + w.get("tag_score", 0) * 0.3
            + w.get("roi_score", 0) * 0.4
            + w.get("defi_score", 0) * 0.2
            + w.get("age_score", 0) * 0.1
            + w.get("social_score", 0) * 0.1
            + w.get("round_trip_penalty", 0) * 1.0
            + w.get("copy_penalty", 0) * 1.0
            + w.get("rug_penalty", 0) * 2.0
            + w.get("low_win_penalty", 0) * 1.0
        )

    max_score_sum = max(
        (sum(_component_score(w) for w in ws) for ws in token_wallets.values()),
        default=1,
    )

    # Re-score each token
    for token in tokens:
        t_addr = token["contract_address"]
        tw = token_wallets.get(t_addr, [])

        smart_count = len(tw)
        smart_score_sum = sum(_component_score(w) for w in tw)
        smart_avg_roi = sum(w.get("avg_roi", 0) or 0 for w in tw) / max(smart_count, 1)
        smart_total_profit = sum(w.get("total_profit", 0) or 0 for w in tw)
        insider_count = sum(1 for w in tw if w.get("insider_flag"))
        sniper_count = sum(1 for w in tw if "sniper" in (w.get("wallet_tags") or "").lower())

        new_score = revised_compute_enhanced_token_score(
            token=token,
            smart_wallet_count=smart_count,
            smart_wallet_score_sum=smart_score_sum,
            smart_wallet_avg_roi=smart_avg_roi,
            smart_wallet_total_profit=smart_total_profit,
            insider_count=insider_count,
            sniper_count=sniper_count,
            max_smart_wallets=max_smart_wallets,
            max_score_sum=max_score_sum,
        )

        token["_original_score"] = token.get("score", 0)
        token["score"] = new_score
        token["smart_wallet_count"] = smart_count
        token["smart_wallet_avg_score"] = round(smart_score_sum / max(smart_count, 1), 1)
        token["insider_count"] = insider_count
        token["sniper_count"] = sniper_count

        # Add smart money to positives
        if smart_count > 0:
            existing = token.get("positives") or []
            smart_signal = f"{smart_count} smart wallets (avg {token['smart_wallet_avg_score']:.0f})"
            if insider_count > 0:
                smart_signal += f", {insider_count} insiders"
            if smart_signal not in existing:
                existing.insert(0, smart_signal)
                token["positives"] = existing

    # Filter duplicate token names per chain - keep only top-scoring one per (name, chain)
    def filter_duplicate_names(tokens: list[dict]) -> list[dict]:
        """Filter duplicate token names per chain, keeping only the highest-scoring one."""
        from collections import defaultdict

        # Group tokens by (symbol, chain)
        groups = defaultdict(list)
        for token in tokens:
            symbol = (token.get("symbol") or "").upper().strip()
            chain = token.get("chain", "").lower()
            if symbol and chain:
                groups[(symbol, chain)].append(token)

        # Keep only the highest-scoring token per group
        filtered_tokens = []
        for (symbol, chain), group_tokens in groups.items():
            if len(group_tokens) == 1:
                filtered_tokens.append(group_tokens[0])
            else:
                # Sort by score (descending) and keep the top one
                group_tokens.sort(key=lambda t: t.get("score", 0), reverse=True)
                top_token = group_tokens[0]
                filtered_tokens.append(top_token)

                # Log the filtering
                duplicates = group_tokens[1:]
                if duplicates:
                    log.info(
                        "filtered_duplicate_names_phase3",
                        symbol=symbol,
                        chain=chain,
                        kept_score=top_token.get("score", 0),
                        filtered_count=len(duplicates),
                        filtered_scores=[t.get("score", 0) for t in duplicates],
                    )

        return filtered_tokens

    # Apply duplicate name filtering before final sorting
    tokens = filter_duplicate_names(tokens)

    # Sort by new composite score
    tokens.sort(key=lambda t: t.get("score", 0), reverse=True)
    return tokens


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: RE-SCORE WALLETS (based on token portfolio quality)
# ═══════════════════════════════════════════════════════════════════════════════


def _compute_wallet_composite_score(
    wallet: dict,
    top_token_count: int,
    avg_token_score: float,
    max_token_count: int,
    max_avg_token_score: float,
) -> float:
    """
    Compute composite wallet score using ALL wallet data + token portfolio quality.

    Weights (sum = 100):
      Portfolio Quality      30  (how many top tokens, their average score)
      PnL Performance        25  (total_profit, realized_pnl, avg_roi)
      Win Rate               15  (win_rate, tokens_profitable/tokens_total)
      Trading Activity       10  (total_trades, buy/sell ratio)
      Entry Timing           10  (entry_timing_score)
      Insider & Tags        10  (insider_flag, GMGN wallet_tags only)
    """
    score = 0.0

    # ── Portfolio Quality (0-30) ──
    if max_token_count > 0:
        token_ratio = min(top_token_count / max(max_token_count * 0.3, 1), 1.0)
        score += token_ratio * 15

    if max_avg_token_score > 0 and top_token_count > 0:
        quality_ratio = min(avg_token_score / max_avg_token_score, 1.0)
        score += quality_ratio * 15

    # ── PnL Performance (0-25) ──
    total_profit = wallet.get("total_profit") or 0
    avg_roi = wallet.get("avg_roi") or 0

    # Profit score (log scale, capped)
    if total_profit > 100000:
        score += 12
    elif total_profit > 10000:
        score += 10
    elif total_profit > 1000:
        score += 7
    elif total_profit > 100:
        score += 4
    elif total_profit > 0:
        score += 2

    # ROI score
    if avg_roi > 500:
        score += 13
    elif avg_roi > 100:
        score += 10
    elif avg_roi > 50:
        score += 7
    elif avg_roi > 10:
        score += 4
    elif avg_roi > 0:
        score += 2

    # ── Win Rate (0-15) ──
    win_rate = wallet.get("win_rate") or 0
    tokens_profitable = wallet.get("tokens_profitable") or 0
    wallet.get("tokens_total") or 0

    if win_rate >= 0.8:
        score += 10
    elif win_rate >= 0.6:
        score += 7
    elif win_rate >= 0.4:
        score += 4
    elif win_rate > 0:
        score += 2

    # Volume of wins matters too
    if tokens_profitable >= 5:
        score += 5
    elif tokens_profitable >= 2:
        score += 3
    elif tokens_profitable >= 1:
        score += 1

    # ── Trading Activity (0-10) ──
    total_trades = wallet.get("total_trades") or 0
    buy_count = wallet.get("buy_count") or 0
    sell_count = wallet.get("sell_count") or 0

    # Active but not over-trading
    if 5 <= total_trades <= 200:
        score += 5
    elif total_trades > 200:
        score += 3
    elif total_trades > 0:
        score += 1

    # Balanced buy/sell (not just holding)
    if sell_count > 0 and buy_count > 0:
        ratio = min(buy_count, sell_count) / max(buy_count, sell_count)
        if ratio > 0.3:
            score += 5
        elif ratio > 0.1:
            score += 3
        else:
            score += 1

    # ── Entry Timing (0-10) ──
    entry_timing = wallet.get("entry_timing_score") or 0
    score += min(entry_timing * 10, 10)

    # ── Insider & Tags (0-10) ──
    insider = wallet.get("insider_flag")
    tags = wallet.get("wallet_tags") or ""
    rugs = wallet.get("rug_history_count") or 0
    copy_trade = wallet.get("copy_trade_flag")

    if insider:
        score += 5
    if "sniper" in tags.lower():
        score += 4
    if "kol" in tags.lower():
        score += 3
    if "smart" in tags.lower():
        score += 3
    elif "TOP" in tags:
        score += 2

    # Penalties
    if rugs > 0:
        score -= min(rugs * 3, 8)
    if copy_trade:
        score -= 5

    return round(max(0, min(100, score)), 2)


def rescore_wallets(
    wallets: list[dict],
    scored_tokens: list[dict],
    wallet_token_map: dict[str, list[dict]],
) -> list[dict]:
    """Re-score wallets based on how many top tokens they hold."""
    token_by_addr = {t["contract_address"]: t for t in scored_tokens}

    # Compute stats for normalization
    wallet_top_token_counts = []
    wallet_avg_token_scores = []
    for w in wallets:
        entries = wallet_token_map.get(w["address"], [])
        top_tokens = [e for e in entries if e["token_address"] in token_by_addr]
        top_count = len(top_tokens)
        avg_score = sum(token_by_addr[e["token_address"]].get("score", 0) for e in top_tokens) / max(top_count, 1)
        wallet_top_token_counts.append(top_count)
        wallet_avg_token_scores.append(avg_score)

    max_token_count = max(wallet_top_token_counts) if wallet_top_token_counts else 1
    max_avg_score = max(wallet_avg_token_scores) if wallet_avg_token_scores else 1

    for i, wallet in enumerate(wallets):
        entries = wallet_token_map.get(wallet["address"], [])
        top_tokens = [e for e in entries if e["token_address"] in token_by_addr]
        top_count = len(top_tokens)
        avg_token_score = wallet_avg_token_scores[i]

        new_score = _compute_wallet_composite_score(
            wallet=wallet,
            top_token_count=top_count,
            avg_token_score=avg_token_score,
            max_token_count=max_token_count,
            max_avg_token_score=max_avg_score,
        )

        wallet["_original_score"] = wallet.get("wallet_score", 0)
        wallet["wallet_score"] = new_score
        wallet["top_token_count"] = top_count
        wallet["avg_top_token_score"] = round(avg_token_score, 1)

    # Sort by new composite score
    wallets.sort(key=lambda w: w.get("wallet_score", 0), reverse=True)
    return wallets


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════


def run_cross_scoring(
    min_wallet_score: float = 30,
    iterations: int = 1,
    top_n: int = 100,
) -> dict[str, Any]:
    """Run the iterative cross-scoring pipeline."""
    start = time.time()

    log.info("=" * 60)
    log.info("Cross-Scoring Pipeline Starting")
    log.info(f"Min wallet score: {min_wallet_score}")
    log.info(f"Iterations: {iterations}")
    log.info("=" * 60)

    # Load data
    tokens = load_tokens()
    wallets = load_wallets(min_wallet_score)
    wallet_token_map = load_wallet_token_map()

    log.info("data_loaded", tokens=len(tokens), wallets=len(wallets))

    if not tokens:
        log.error("no_tokens")
        return {"status": "no_tokens"}
    if not wallets:
        log.warning("no_wallets")
        # Still write tokens with original scores
        _write_output(tokens[:top_n])
        return {"status": "no_wallets", "tokens": len(tokens)}

    for iteration in range(iterations):
        log.info(f"iteration_{iteration + 1}_start")

        # Phase 2: Re-score tokens
        tokens = rescore_tokens(tokens, wallets, wallet_token_map)
        log.info(
            "tokens_rescored",
            top5=[(t.get("symbol", "?"), t.get("score", 0)) for t in tokens[:5]],
        )

        # Phase 3: Re-score wallets
        wallets = rescore_wallets(wallets, tokens, wallet_token_map)
        log.info(
            "wallets_rescored",
            top5=[(w["address"][:12], w["wallet_score"]) for w in wallets[:5]],
        )

    # Write output
    _write_output(tokens[:top_n])

    elapsed = time.time() - start

    # Build result
    result = {
        "status": "ok",
        "tokens_scored": len(tokens),
        "wallets_scored": len(wallets),
        "iterations": iterations,
        "elapsed": round(elapsed, 1),
        "top_tokens": [
            {
                "symbol": t.get("symbol", "?"),
                "score": t.get("score", 0),
                "original": t.get("_original_score", 0),
                "smart_wallets": t.get("smart_wallet_count", 0),
                "insiders": t.get("insider_count", 0),
            }
            for t in tokens[:10]
        ],
        "top_wallets": [
            {
                "address": w["address"][:16] + "...",
                "score": w["wallet_score"],
                "original": w.get("_original_score", 0),
                "top_tokens": w.get("top_token_count", 0),
                "avg_token_score": w.get("avg_top_token_score", 0),
            }
            for w in wallets[:10]
        ],
    }

    log.info(
        "cross_scoring_done",
        **{k: v for k, v in result.items() if k != "top_tokens" and k != "top_wallets"},
    )

    return result


def _write_output(tokens: list[dict]) -> None:
    """Write re-scored tokens to phase3 output. Preserves symbols from enricher."""
    PHASE3_OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    # Clean internal fields before writing
    clean_tokens = []
    for t in tokens:
        clean = {k: v for k, v in t.items() if not k.startswith("_")}
        clean_tokens.append(clean)

    # Preserve symbols from existing enricher output
    existing_symbols = {}
    if OUTPUT_PATH.exists():
        try:
            old = json.loads(OUTPUT_PATH.read_text())
            for t in old.get("tokens", []):
                addr = (t.get("contract_address") or "").lower()
                if addr:
                    existing_symbols[addr] = t.get("symbol", "?")
        except Exception:
            pass

    for t in clean_tokens:
        addr = (t.get("contract_address") or "").lower()
        if addr in existing_symbols and t.get("symbol") in (None, "?", ""):
            t["symbol"] = existing_symbols[addr]

    output = {
        "generated_at": time.time(),
        "generated_at_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_candidates": len(clean_tokens),
        "enriched": len(clean_tokens),
        "top_n": len(clean_tokens),
        "pipeline_status": "ok",
        "tokens": clean_tokens,
    }

    # Save as Phase 3 (smart money reranked) — do NOT overwrite top100.json
    with open(PHASE3_OUTPUT, "w") as f:
        json.dump({**output, "phase": "phase3_smartmoney"}, f, indent=2, default=str)

    log.info(
        "output_written",
        phase3=str(PHASE3_OUTPUT),
        tokens=len(clean_tokens),
    )


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Cross-scoring pipeline")
    parser.add_argument("--min-wallet-score", type=float, default=30)
    parser.add_argument("--iterations", type=int, default=1, help="Feedback loop iterations")
    parser.add_argument("--top-n", type=int, default=100)
    args = parser.parse_args()

    result = run_cross_scoring(
        min_wallet_score=args.min_wallet_score,
        iterations=args.iterations,
        top_n=args.top_n,
    )

    print(json.dumps(result, indent=2, default=str))
    return 0 if result.get("status") == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
