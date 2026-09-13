#!/usr/bin/env python3
"""
Social Enhancement — Phase 4 of the 4-database pipeline.

Runs AFTER cross-scoring (smart money reranking).
Adds Twitter + Telegram social signals, then re-scores both tokens and wallets.

4-Phase Pipeline:
  Phase 1: token_enricher.py     → top100_phase1_initial.json
  Phase 2: wallet_tracker.py     → wallets_phase2_initial (DB)
  Phase 3: cross_scoring.py      → top100_phase3_smartmoney.json
  Phase 4: social_enhancement.py → top100_phase4_social.json + wallets_phase4_final (DB)

Social signals collected per token:
  Telegram:
    - channel_count (how many channels mentioned it)
    - mention_velocity (mentions per hour)
    - viral_score (exponential growth detection)
    - community_quality (active channels vs noise)
  Twitter/X:
    - mention_count (search API)
    - sentiment_score (positive/negative ratio)
    - kol_activity (key opinion leader engagement)
    - trending_score (rate of mention growth)
  Composite:
    - social_momentum (combined Telegram + Twitter velocity)
    - social_quality (signal-to-noise ratio)

Usage:
    python3 social_enhancement.py                     # full pipeline
    python3 social_enhancement.py --skip-twitter      # Telegram only
    python3 social_enhancement.py --skip-telegram     # Twitter only
    python3 social_enhancement.py --dry-run           # don't write
"""

from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from hermes_screener.config import settings
from hermes_screener.keyword_discovery import (
    run_keyword_discovery,
    save_discovered_tokens,
)
from hermes_screener.logging import get_logger

log = get_logger("social_enhancement")

DB_PATH = settings.db_path
WALLETS_DB = settings.wallets_db_path
DATA_DIR = settings.hermes_home / "data"

# Phase output paths
PHASE1_OUTPUT = DATA_DIR / "token_screener" / "top100_phase1_initial.json"
PHASE3_OUTPUT = DATA_DIR / "token_screener" / "top100_phase3_smartmoney.json"
PHASE4_OUTPUT = DATA_DIR / "token_screener" / "top100_phase4_social.json"
PHASE4_WALLETS = DATA_DIR / "token_screener" / "wallets_phase4_final.json"
LATEST_OUTPUT = settings.output_path  # top100.json (always latest)

SURF_CLI = (
    shutil.which("surf") if (shutil := __import__("shutil")) else str(settings.hermes_home / "local" / "bin" / "surf")
)


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE OUTPUT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════


def save_phase_output(path: Path, tokens: list[dict], phase: str, extra_meta: dict = None) -> None:
    """Save a phase output with metadata."""
    path.parent.mkdir(parents=True, exist_ok=True)
    clean = [{k: v for k, v in t.items() if not k.startswith("_")} for t in tokens]
    output = {
        "generated_at": time.time(),
        "generated_at_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "phase": phase,
        "total_tokens": len(clean),
        "tokens": clean,
    }
    if extra_meta:
        output.update(extra_meta)
    with open(path, "w") as f:
        json.dump(output, f, indent=2, default=str)
    log.info("phase_saved", path=str(path), phase=phase, tokens=len(clean))


def load_phase_input(path: Path) -> list[dict]:
    """Load tokens from a previous phase output."""
    if not path.exists():
        return []
    with open(path) as f:
        data = json.load(f)
        return data.get("tokens", data.get("top_tokens", []))


# ═══════════════════════════════════════════════════════════════════════════════
# TELEGRAM SOCIAL SIGNALS
# ═══════════════════════════════════════════════════════════════════════════════


def collect_telegram_signals(tokens: list[dict]) -> dict[str, dict]:
    """
    Collect Telegram social signals from the contracts DB.

    For each token:
      - channel_count: unique channels mentioning this token
      - mention_count: total messages mentioning this token
      - mention_velocity: mentions per hour (recent vs older)
      - viral_score: exponential growth detection
      - channel_quality: ratio of active vs dead channels
    """
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    signals: dict[str, dict] = {}
    now = time.time()

    for token in tokens:
        addr = token.get("contract_address", "")
        if not addr:
            continue

        # Get all mentions for this token
        c.execute(
            """
            SELECT channel_id, message_id, observed_at
            FROM telegram_contract_calls
            WHERE contract_address = ?
            ORDER BY observed_at DESC
        """,
            (addr,),
        )
        mentions = c.fetchall()

        if not mentions:
            signals[addr] = {
                "tg_channel_count": 0,
                "tg_mention_count": 0,
                "tg_mention_velocity": 0,
                "tg_viral_score": 0,
                "tg_channel_quality": 0,
                "tg_first_mention_hours_ago": None,
                "tg_last_mention_minutes_ago": None,
            }
            continue

        # Channel count
        channels = set(m["channel_id"] for m in mentions)
        channel_count = len(channels)

        # Mention velocity (mentions in last 48h / 48 for broader signal)
        recent_cutoff = now - (48 * 3600)
        recent_mentions = [m for m in mentions if (m["observed_at"] or 0) > recent_cutoff]
        velocity = len(recent_mentions) / 48.0 if recent_mentions else 0

        # Viral score: fast detection via recent acceleration
        # Compare last 2h rate vs overall 48h average rate
        h2_cutoff = now - (2 * 3600)
        h2_mentions = sum(1 for m in mentions if (m["observed_at"] or 0) > h2_cutoff)
        h2_rate = h2_mentions / 2.0  # mentions per hour in last 2h

        if velocity > 0 and h2_rate > 0:
            # Acceleration: how much faster recent is vs overall average
            acceleration = h2_rate / velocity
            # 2x = mildly viral, 5x = very viral, 10x+ = explosive
            viral_score = min(acceleration * 8, 50)
        elif h2_rate > 0 and velocity == 0:
            # Brand new activity with no prior history
            viral_score = min(h2_rate * 10, 40)
        else:
            viral_score = 0

        # Also boost viral if spreading to new channels fast
        h2_channels = set(m["channel_id"] for m in mentions if (m["observed_at"] or 0) > h2_cutoff)
        all_channels = set(m["channel_id"] for m in mentions)
        if len(all_channels) > 0:
            channel_spread = len(h2_channels) / len(all_channels)
            if channel_spread > 0.5:  # recently active in majority of channels
                viral_score = min(viral_score + 10, 50)

        # Channel quality: channels with 2+ mentions (active) vs 1 mention (noise)
        channel_mention_counts = defaultdict(int)
        for m in mentions:
            channel_mention_counts[m["channel_id"]] += 1
        active_channels = sum(1 for c in channel_mention_counts.values() if c >= 2)
        channel_quality = active_channels / max(channel_count, 1)

        # Timing
        timestamps = [m["observed_at"] for m in mentions if m["observed_at"]]
        first_hours = (now - min(timestamps)) / 3600 if timestamps else None
        last_minutes = (now - max(timestamps)) / 60 if timestamps else None

        signals[addr] = {
            "tg_channel_count": channel_count,
            "tg_mention_count": len(mentions),
            "tg_mention_velocity": round(velocity, 2),
            "tg_viral_score": round(viral_score, 1),
            "tg_channel_quality": round(channel_quality, 2),
            "tg_first_mention_hours_ago": (round(first_hours, 1) if first_hours else None),
            "tg_last_mention_minutes_ago": (round(last_minutes, 1) if last_minutes else None),
        }

    conn.close()
    log.info("telegram_signals_collected", tokens=len(signals))
    return signals


# ═══════════════════════════════════════════════════════════════════════════════
# TWITTER/X SOCIAL SIGNALS (via Surf CLI)
# ═══════════════════════════════════════════════════════════════════════════════


def _surf_cmd(args: list) -> dict | None:
    """Run Surf CLI and return parsed JSON."""
    try:
        result = subprocess.run(
            ["surf"] + args,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            return None
        return json.loads(result.stdout)
    except Exception:
        return None


def collect_twitter_signals(tokens: list[dict]) -> dict[str, dict]:
    """
    Collect Twitter/X social signals via Surf CLI.

    For each token:
      - tw_mention_count: search results for token symbol/name
      - tw_sentiment: positive/negative/neutral ratio
      - tw_trending_score: recent mention velocity
      - tw_kol_score: Key Opinion Leader engagement
    """
    signals: dict[str, dict] = {}

    # Batch symbols for efficiency (Surf can search multiple)
    symbols = []
    for t in tokens:
        sym = t.get("symbol", "")
        name = t.get("name", "")
        addr = t.get("contract_address", "")
        if sym:
            symbols.append((addr, sym, name))

    log.info("twitter_collection_start", tokens=len(symbols))

    for addr, sym, name in symbols:
        signal = {
            "tw_mention_count": 0,
            "tw_sentiment_score": 0,
            "tw_trending_score": 0,
            "tw_kol_score": 0,
            "tw_recent_tweets": [],
        }

        # Search for token on Twitter via Surf
        search_term = f"${sym}" if len(sym) <= 8 else sym
        data = _surf_cmd(["search-social-posts", "--q", search_term, "--limit", "10"])

        if data:
            # Handle Surf search-social-posts response format
            tweets = data if isinstance(data, list) else data.get("data", data.get("results", data.get("tweets", [])))
            if isinstance(tweets, list) and tweets:
                signal["tw_mention_count"] = len(tweets)

                # Sentiment: simple keyword analysis
                positive_kw = {
                    "bullish",
                    "moon",
                    "gem",
                    "100x",
                    "pump",
                    "buy",
                    "long",
                    "🚀",
                    "💎",
                    "🔥",
                }
                negative_kw = {
                    "scam",
                    "rug",
                    "dump",
                    "sell",
                    "bearish",
                    "avoid",
                    "shit",
                    "💀",
                    "⚠️",
                }

                pos_count = 0
                neg_count = 0
                for tweet in tweets[:20]:
                    text = ""
                    if isinstance(tweet, dict):
                        text = tweet.get("text", tweet.get("content", tweet.get("tweet", "")))
                    elif isinstance(tweet, str):
                        text = tweet
                    text_lower = text.lower()
                    if any(kw in text_lower for kw in positive_kw):
                        pos_count += 1
                    if any(kw in text_lower for kw in negative_kw):
                        neg_count += 1

                total = pos_count + neg_count
                if total > 0:
                    signal["tw_sentiment_score"] = round((pos_count / total) * 100, 1)

                # Trending: tweets with high engagement (Surf uses stats.likes/stats.retweets)
                engagement_scores = []
                for tweet in tweets[:10] if isinstance(tweets, list) else []:
                    if isinstance(tweet, dict):
                        stats = tweet.get("stats", {})
                        eng = (stats.get("likes", 0) or 0) + (stats.get("retweets", 0) or 0) * 2
                        if not stats:
                            eng = (tweet.get("likes", tweet.get("favorite_count", 0)) or 0) + (
                                tweet.get("retweets", tweet.get("retweet_count", 0)) or 0
                            ) * 2
                        engagement_scores.append(eng)

                if engagement_scores:
                    signal["tw_trending_score"] = round(
                        min(sum(engagement_scores) / len(engagement_scores) / 10, 50), 1
                    )

        signals[addr] = signal

    log.info("twitter_signals_collected", tokens=len(signals))
    return signals


# ═══════════════════════════════════════════════════════════════════════════════
# COMPOSITE SOCIAL SCORING
# ═══════════════════════════════════════════════════════════════════════════════


def compute_social_score(
    tg_signals: dict,
    tw_signals: dict,
    max_tg_velocity: float,
    max_tw_mentions: int,
    max_viral: float,
) -> tuple[float, dict]:
    """
    Compute composite social score from Telegram + Twitter signals.

    Weights:
      Telegram velocity      25  (how fast mentions are growing)
      Telegram viral          15  (exponential growth detection)
      Telegram quality        10  (active channels vs noise)
      Twitter mentions        15  (search result count)
      Twitter sentiment       10  (positive/negative ratio)
      Twitter trending        15  (engagement levels)
      Cross-platform bonus    10  (both Telegram AND Twitter active)
    """
    score = 0.0
    details = {}

    # ── Telegram (50pts max) ──
    tg_vel = tg_signals.get("tg_mention_velocity", 0)
    tg_viral = tg_signals.get("tg_viral_score", 0)
    tg_quality = tg_signals.get("tg_channel_quality", 0)
    tg_signals.get("tg_channel_count", 0)

    if max_tg_velocity > 0:
        vel_ratio = min(tg_vel / max(max_tg_velocity * 0.3, 0.01), 1.0)
        score += vel_ratio * 25
        details["tg_velocity_pts"] = round(vel_ratio * 25, 1)

    if max_viral > 0:
        viral_ratio = min(tg_viral / max_viral, 1.0)
        score += viral_ratio * 15
        details["tg_viral_pts"] = round(viral_ratio * 15, 1)

    quality_pts = tg_quality * 10
    score += quality_pts
    details["tg_quality_pts"] = round(quality_pts, 1)

    # ── Twitter (40pts max) ──
    tw_mentions = tw_signals.get("tw_mention_count", 0)
    tw_sentiment = tw_signals.get("tw_sentiment_score", 0)
    tw_trending = tw_signals.get("tw_trending_score", 0)

    if max_tw_mentions > 0:
        tw_ratio = min(tw_mentions / max(max_tw_mentions * 0.3, 1), 1.0)
        score += tw_ratio * 15
        details["tw_mentions_pts"] = round(tw_ratio * 15, 1)

    if tw_sentiment > 50:
        sent_pts = ((tw_sentiment - 50) / 50) * 10
        score += sent_pts
        details["tw_sentiment_pts"] = round(sent_pts, 1)

    if tw_trending > 0:
        trend_ratio = min(tw_trending / 30, 1.0)
        score += trend_ratio * 15
        details["tw_trending_pts"] = round(trend_ratio * 15, 1)

    # ── Cross-platform bonus (10pts) ──
    tg_active = tg_vel > 0.5 or tg_viral > 10
    tw_active = tw_mentions > 2
    if tg_active and tw_active:
        score += 10
        details["cross_platform_bonus"] = 10
    elif tg_active or tw_active:
        score += 3
        details["cross_platform_bonus"] = 3

    return round(min(score, 100), 2), details


# ═══════════════════════════════════════════════════════════════════════════════
# TOKEN RE-SCORING WITH SOCIAL ENHANCEMENT
# ═══════════════════════════════════════════════════════════════════════════════


def rescore_tokens_with_social(
    tokens: list[dict],
    tg_signals: dict[str, dict],
    tw_signals: dict[str, dict],
) -> list[dict]:
    """Re-score tokens: keep smart money score, add social enhancement."""

    # Compute max values for normalization
    max_tg_velocity = max((s.get("tg_mention_velocity", 0) for s in tg_signals.values()), default=1)
    max_viral = max((s.get("tg_viral_score", 0) for s in tg_signals.values()), default=1)
    max_tw_mentions = max((s.get("tw_mention_count", 0) for s in tw_signals.values()), default=1)

    for token in tokens:
        addr = token.get("contract_address", "")
        tg = tg_signals.get(addr, {})
        tw = tw_signals.get(addr, {})

        social_score, social_details = compute_social_score(tg, tw, max_tg_velocity, max_tw_mentions, max_viral)

        # Store previous score
        token["_smartmoney_score"] = token.get("score", 0)

        # Composite: 70% smart money score + 30% social score
        smart_money = token.get("score", 0)
        new_score = round(smart_money * 0.70 + social_score * 0.30, 2)

        token["score"] = new_score
        token["social_score"] = social_score
        token["social_details"] = social_details

        # Merge Telegram signals
        for k, v in tg.items():
            token[k] = v

        # Merge Twitter signals
        for k, v in tw.items():
            if k != "tw_recent_tweets":  # skip verbose field
                token[k] = v

        # Update positives with social signals
        positives = list(token.get("positives") or [])
        if social_score > 50:
            positives.insert(0, f"SOCIAL HOT ({social_score:.0f})")
        if tg.get("tg_viral_score", 0) > 20:
            positives.append(f"VIRAL TG ({tg['tg_viral_score']:.0f})")
        if tw.get("tw_sentiment_score", 0) > 70:
            positives.append(f"BULLISH TW ({tw['tw_sentiment_score']:.0f}%)")
        token["positives"] = positives

    # Sort by new composite score
    tokens.sort(key=lambda t: t.get("score", 0), reverse=True)
    return tokens


# ═══════════════════════════════════════════════════════════════════════════════
# WALLET RE-RANKING WITH SOCIAL CONTEXT
# ═══════════════════════════════════════════════════════════════════════════════


def rescore_wallets_with_social(
    wallets: list[dict],
    social_tokens: list[dict],
    wallet_token_map: dict[str, list[dict]],
) -> list[dict]:
    """Re-score wallets based on social-enhanced token portfolio quality."""
    token_by_addr = {t["contract_address"]: t for t in social_tokens}

    for wallet in wallets:
        addr = wallet.get("address", "")
        entries = wallet_token_map.get(addr, [])

        # Calculate social portfolio quality
        held_social_scores = []
        held_token_scores = []
        for entry in entries:
            t_addr = entry.get("token_address", "")
            t = token_by_addr.get(t_addr, {})
            held_social_scores.append(t.get("social_score", 0))
            held_token_scores.append(t.get("score", 0))

        avg_social = sum(held_social_scores) / max(len(held_social_scores), 1)
        sum(held_token_scores) / max(len(held_token_scores), 1)
        social_token_count = sum(1 for s in held_social_scores if s > 30)

        # Portfolio social boost (0-20pts)
        social_boost = 0
        if avg_social > 50:
            social_boost += 10
        elif avg_social > 30:
            social_boost += 5
        if social_token_count >= 3:
            social_boost += 10
        elif social_token_count >= 1:
            social_boost += 5

        wallet["_social_portfolio_boost"] = social_boost
        wallet["avg_token_social_score"] = round(avg_social, 1)
        wallet["social_token_count"] = social_token_count
        wallet["wallet_score"] = round(wallet.get("wallet_score", 0) + social_boost, 2)

    wallets.sort(key=lambda w: w.get("wallet_score", 0), reverse=True)
    return wallets


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════


def run_social_enhancement(
    skip_twitter: bool = False,
    skip_telegram: bool = False,
    dry_run: bool = False,
    top_n: int = 100,
) -> dict[str, Any]:
    """Run the social enhancement phase (Phase 4)."""
    start = time.time()

    log.info("=" * 60)
    log.info("Social Enhancement (Phase 4) starting")
    log.info(f"Skip Twitter: {skip_twitter}")
    log.info(f"Skip Telegram: {skip_telegram}")
    log.info("=" * 60)

    # Load Phase 3 output (smart money reranked tokens)
    tokens = load_phase_input(PHASE3_OUTPUT)
    if not tokens:
        # Fallback to latest output
        tokens = load_phase_input(LATEST_OUTPUT)
    if not tokens:
        log.error("no_input_tokens")
        return {"status": "error", "message": "No Phase 3 input found"}

    log.info("input_loaded", tokens=len(tokens))

    # ── Collect social signals ──
    tg_signals = {}
    tw_signals = {}

    if not skip_telegram:
        tg_signals = collect_telegram_signals(tokens)

    if not skip_twitter:
        tw_signals = collect_twitter_signals(tokens)

    # ── Re-score tokens with social ──
    tokens = rescore_tokens_with_social(tokens, tg_signals, tw_signals)
    log.info(
        "tokens_rescored_with_social",
        top5=[
            (
                t.get("symbol", t.get("contract_address", "?")),
                t.get("score", 0),
                t.get("social_score", 0),
            )
            for t in tokens[:5]
        ],
    )

    # ── Save Phase 4 output ──
    if not dry_run:
        save_phase_output(
            PHASE4_OUTPUT,
            tokens[:top_n],
            "phase4_social",
            {
                "telegram_signals": len(tg_signals),
                "twitter_signals": len(tw_signals),
            },
        )
        # Also update the latest output
        save_phase_output(LATEST_OUTPUT, tokens[:top_n], "latest")

    # ── Re-rank wallets with social context ──
    wallet_token_map = _load_wallet_token_map()
    wallets = _load_wallets()

    if wallets:
        wallets = rescore_wallets_with_social(wallets, tokens, wallet_token_map)
        log.info(
            "wallets_reranked_with_social",
            top5=[(w["address"][:12], w["wallet_score"]) for w in wallets[:5]],
        )

        if not dry_run:
            # Save wallet phase output
            wallet_output = {
                "generated_at": time.time(),
                "generated_at_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "phase": "phase4_wallets_final",
                "total_wallets": len(wallets),
                "wallets": [{k: v for k, v in w.items() if not k.startswith("_")} for w in wallets[:500]],
            }
            PHASE4_WALLETS.parent.mkdir(parents=True, exist_ok=True)
            with open(PHASE4_WALLETS, "w") as f:
                json.dump(wallet_output, f, indent=2, default=str)

            # Update wallet DB scores
            conn = sqlite3.connect(str(WALLETS_DB), timeout=30)
            for w in wallets:
                conn.execute(
                    "UPDATE tracked_wallets SET wallet_score = ? WHERE address = ?",
                    (w["wallet_score"], w["address"]),
                )
            conn.commit()
            conn.close()

    # ── Keyword Discovery: find new tokens from trending topics ──
    existing = set(t.get("contract_address", "") for t in tokens)
    keyword_result = run_keyword_discovery(
        max_keywords=10,
        max_tokens_per_keyword=5,
        hours_back=24,
        use_llm=False,  # TF-IDF (no local model available)
        existing_addresses=existing,
    )
    if keyword_result.get("tokens_discovered", 0) > 0 and not dry_run:
        save_discovered_tokens(keyword_result["tokens"])
        log.info(
            "keyword_tokens_discovered",
            count=keyword_result["tokens_discovered"],
            keywords=[k["keyword"] for k in keyword_result.get("keywords", [])[:5]],
        )

    elapsed = time.time() - start

    result = {
        "status": "ok",
        "phase": "4_social_enhancement",
        "tokens_processed": len(tokens),
        "wallets_processed": len(wallets),
        "telegram_signals": len(tg_signals),
        "twitter_signals": len(tw_signals),
        "elapsed": round(elapsed, 1),
        "top_tokens": [
            {
                "symbol": t.get("symbol", t.get("contract_address", "?")),
                "score": t["score"],
                "smartmoney": t.get("_smartmoney_score", 0),
                "social": t.get("social_score", 0),
            }
            for t in tokens[:10]
        ],
        "top_wallets": [
            {
                "address": w["address"][:16] + "...",
                "score": w["wallet_score"],
                "social_boost": w.get("_social_portfolio_boost", 0),
                "social_tokens": w.get("social_token_count", 0),
            }
            for w in wallets[:10]
        ],
    }

    log.info(
        "social_enhancement_done",
        **{k: v for k, v in result.items() if k not in ("top_tokens", "top_wallets")},
    )

    return result


def _load_wallet_token_map() -> dict[str, list[dict]]:
    try:
        conn = sqlite3.connect(f"file:{WALLETS_DB}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM wallet_token_entries").fetchall()
        conn.close()
        mapping = defaultdict(list)
        for r in rows:
            mapping[r["wallet_address"]].append(dict(r))
        return mapping
    except Exception:
        return {}


def _load_wallets(min_score: float = 30) -> list[dict]:
    try:
        conn = sqlite3.connect(f"file:{WALLETS_DB}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM tracked_wallets WHERE wallet_score >= ? ORDER BY wallet_score DESC",
            (min_score,),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


# ═══════════════════════════════════════════════════════════════════════════════
# FULL PIPELINE ORCHESTRATOR (Phases 1-4)
# ═══════════════════════════════════════════════════════════════════════════════


def run_full_pipeline(
    min_wallet_score: float = 30,
    skip_twitter: bool = False,
    top_n: int = 100,
) -> dict[str, Any]:
    """
    Run the complete 4-phase pipeline:
      Phase 1: token_enricher.py (already run by cron at :10)
      Phase 2: wallet_tracker.py (already run by cron at :15)
      Phase 3: cross_scoring.py (smart money reranking)
      Phase 4: social_enhancement.py (Twitter + Telegram + final rerank)
    """
    start = time.time()
    log.info("full_pipeline_start")

    # Phase 3: Cross-scoring (smart money)
    sys.path.insert(0, str(settings.hermes_home / "scripts"))
    from cross_scoring import run_cross_scoring

    phase3_result = run_cross_scoring(
        min_wallet_score=min_wallet_score,
        iterations=1,
        top_n=top_n,
    )

    # Phase 4: Social enhancement
    phase4_result = run_social_enhancement(
        skip_twitter=skip_twitter,
        skip_telegram=False,
        dry_run=False,
        top_n=top_n,
    )

    elapsed = time.time() - start

    return {
        "status": "ok",
        "pipeline": "full_4_phase",
        "elapsed": round(elapsed, 1),
        "phase3_smart_money": phase3_result,
        "phase4_social": phase4_result,
        "outputs": {
            "phase1_initial": str(PHASE1_OUTPUT),
            "phase3_smartmoney": str(PHASE3_OUTPUT),
            "phase4_social": str(PHASE4_OUTPUT),
            "phase4_wallets": str(PHASE4_WALLETS),
            "latest": str(LATEST_OUTPUT),
        },
    }


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Social enhancement pipeline")
    parser.add_argument("--skip-twitter", action="store_true")
    parser.add_argument("--skip-telegram", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--top-n", type=int, default=100)
    parser.add_argument("--full-pipeline", action="store_true", help="Run Phases 3+4 together")
    args = parser.parse_args()

    if args.full_pipeline:
        result = run_full_pipeline(top_n=args.top_n, skip_twitter=args.skip_twitter)
    else:
        result = run_social_enhancement(
            skip_twitter=args.skip_twitter,
            skip_telegram=args.skip_telegram,
            dry_run=args.dry_run,
            top_n=args.top_n,
        )

    print(json.dumps(result, indent=2, default=str))
    return 0 if result.get("status") == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
