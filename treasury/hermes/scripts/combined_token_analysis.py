#!/usr/bin/env python3
"""
Combined Telegram + Twitter Analysis for Top 10 Tokens

Merges:
  - Telegram: members, sentiment_score, sentiment_label from top10_tokens.db
  - Twitter: profile quality, search quality, tweet-level sentiment from twitter_token_analysis.json
  - Twitter sentiment: keyword-based scoring (same approach as Dexscreener buy/sell ratio)
"""

import json
import re
import sqlite3
from pathlib import Path

DATA_DIR = Path.home() / ".hermes" / "data" / "token_screener"
TWITTER_JSON = DATA_DIR / "twitter_token_analysis.json"
TOP10_DB = Path.home() / ".hermes" / "data" / "top10_tokens.db"
OUTPUT_JSON = DATA_DIR / "combined_token_analysis.json"

# ── Sentiment Keywords (Telegram-style approach) ────────────────────────────
BULLISH_WORDS = {
    "bullish",
    "moon",
    "mooning",
    "pump",
    "pumping",
    "gem",
    "100x",
    "10x",
    "1000x",
    "buy",
    "buying",
    "bought",
    "long",
    "hodl",
    "hold",
    "holding",
    "accumulate",
    "rocket",
    "lfg",
    "wagmi",
    "based",
    "chad",
    "alpha",
    "early",
    "undervalued",
    "breakout",
    "rally",
    "surge",
    "explodes",
    "exploding",
    "soaring",
    "skyrocket",
    "massive",
    "huge",
    "incredible",
    "amazing",
    "love",
    "great",
    "strong",
    "diamond hands",
    "to the moon",
    "next big thing",
    "easy money",
    "free money",
    "partnership",
    "listing",
    "listed",
    "announcement",
    "launch",
    "launched",
    "community",
    "team",
    "dev",
    "utility",
    "innovation",
    "growth",
    "green",
    "up",
    "rising",
    "gains",
    "profit",
    "winner",
    "winning",
}

BEARISH_WORDS = {
    "bearish",
    "dump",
    "dumping",
    "rug",
    "rugpull",
    "rug pull",
    "scam",
    "scammer",
    "sell",
    "selling",
    "sold",
    "short",
    "rekt",
    "ngmi",
    "dead",
    "dying",
    "crash",
    "crashing",
    "tank",
    "tanking",
    "falling",
    "collapse",
    "ponzi",
    "honeypot",
    "honeypotted",
    "stuck",
    "locked",
    "trapped",
    "fake",
    "fraud",
    "steal",
    "stole",
    "stolen",
    "exploit",
    "hack",
    "hacked",
    "exit scam",
    "dev sold",
    "team dumped",
    "abandoned",
    "abandon",
    "overvalued",
    "overhyped",
    "hype",
    "shitcoin",
    "shit",
    "trash",
    "garbage",
    "red",
    "down",
    "loss",
    "losses",
    "bag",
    "bagholder",
    "avoid",
    "warning",
    "careful",
    "risky",
    "danger",
    "suspicious",
}

NEUTRAL_WORDS = {
    "what",
    "how",
    "when",
    "where",
    "which",
    "who",
    "why",
    "chart",
    "price",
    "market",
    "trading",
    "analysis",
    "update",
    "contract",
    "address",
    "token",
    "coin",
    "crypto",
}


def compute_tweet_sentiment(tweets: list) -> dict:
    """Compute sentiment from tweet texts using keyword scoring (Dexscreener-style)."""
    if not tweets:
        return {
            "sentiment_score": None,
            "sentiment_label": "-",
            "bullish": 0,
            "bearish": 0,
            "neutral": 0,
        }

    bullish_count = 0
    bearish_count = 0
    neutral_count = 0
    total_score = 0.0

    for tweet in tweets:
        text = (tweet.get("text", "") or "").lower()
        words = set(re.findall(r"\b\w+\b", text))
        # Also check bigrams
        bigrams = set()
        tokens_list = list(words)
        for i in range(len(tokens_list) - 1):
            bigrams.add(f"{tokens_list[i]} {tokens_list[i+1]}")

        bull_hits = len(words & BULLISH_WORDS) + len(bigrams & BULLISH_WORDS)
        bear_hits = len(words & BEARISH_WORDS) + len(bigrams & BEARISH_WORDS)

        if bull_hits > bear_hits:
            bullish_count += 1
            total_score += min(1.0, bull_hits * 0.3)
        elif bear_hits > bull_hits:
            bearish_count += 1
            total_score -= min(1.0, bear_hits * 0.3)
        else:
            neutral_count += 1

    n = len(tweets)
    # Normalize to -100..100 scale (matching Dexscreener sentiment)
    if n > 0:
        raw = total_score / n  # -1 to +1
        sentiment_score = round(raw * 100, 1)
    else:
        sentiment_score = 0.0

    # Label (same as Dexscreener approach)
    if sentiment_score > 60:
        label = "very_positive"
    elif sentiment_score > 20:
        label = "positive"
    elif sentiment_score > -20:
        label = "neutral"
    elif sentiment_score > -60:
        label = "negative"
    else:
        label = "very_negative"

    return {
        "sentiment_score": sentiment_score,
        "sentiment_label": label,
        "bullish": bullish_count,
        "bearish": bearish_count,
        "neutral": neutral_count,
        "total_analyzed": n,
    }


def load_telegram_data() -> dict:
    """Load Telegram sentiment + metrics from top10_tokens.db."""
    tg = {}
    if not TOP10_DB.exists():
        return tg

    db = sqlite3.connect(str(TOP10_DB))
    db.row_factory = sqlite3.Row

    # Current top 10
    rows = db.execute("SELECT * FROM current_top10 ORDER BY rank").fetchall()
    for r in rows:
        sym = r["symbol"] or ""
        tg[sym.upper()] = {
            "rank": r["rank"],
            "screener_score": r["score"] or 0,
            "fdv": r["fdv"] or 0,
            "volume_h24": r["volume_h24"] or 0,
            "members": 0,
            "sentiment_score": None,
            "sentiment_label": "-",
            "telegram_community": "",
        }

    # Daily metrics (latest per symbol)
    rows = db.execute("""
        SELECT symbol, sentiment_score, sentiment_label, telegram_members, telegram_community_name
        FROM daily_metrics
        WHERE date = (SELECT MAX(date) FROM daily_metrics)
        ORDER BY rank
    """).fetchall()
    for r in rows:
        sym = r["symbol"].upper() if r["symbol"] else ""
        if sym in tg:
            tg[sym]["members"] = r["telegram_members"] or 0
            tg[sym]["sentiment_score"] = r["sentiment_score"]
            tg[sym]["sentiment_label"] = r["sentiment_label"] or "-"
            tg[sym]["telegram_community"] = r["telegram_community_name"] or ""

    # Metrics history (latest member count)
    rows = db.execute("""
        SELECT symbol, members FROM telegram_metrics_history
        WHERE id IN (
            SELECT MAX(id) FROM telegram_metrics_history GROUP BY symbol
        )
    """).fetchall()
    for r in rows:
        sym = r["symbol"].upper() if r["symbol"] else ""
        if sym in tg and r["members"]:
            tg[sym]["members"] = r["members"]

    db.close()
    return tg


def load_twitter_data() -> dict:
    """Load Twitter analysis from JSON."""
    if not TWITTER_JSON.exists():
        return {}
    data = json.loads(TWITTER_JSON.read_text())
    return {d["symbol"].upper(): d for d in data}


def main():
    print("=== Combined Telegram + Twitter Analysis ===\n")

    tg = load_telegram_data()
    tw = load_twitter_data()

    results = []

    for sym in sorted(tg.keys(), key=lambda s: tg[s]["rank"]):
        t = tg[sym]
        twitter = tw.get(sym, {})

        # Twitter profile
        prof = twitter.get("profile", {})
        prof_score = prof.get("profile_quality_score", 0)
        followers = prof.get("followers", 0)
        tw_tweets = prof.get("tweets_scraped", 0)
        avg_likes = prof.get("avg_likes", 0)

        # Twitter search
        ticker_search = twitter.get("ticker_search", {})
        name_search = twitter.get("name_search", {})
        search_score = max(
            ticker_search.get("search_quality_score", 0),
            name_search.get("search_quality_score", 0),
        )

        # Twitter sentiment (standalone, not combined with TG)
        tw_sent_score = twitter.get("twitter_sentiment", {}).get("sentiment_score", None)
        tw_sent_label = twitter.get("twitter_sentiment", {}).get("sentiment_label", "-")

        entry = {
            "rank": t["rank"],
            "symbol": sym,
            "screener_score": t["screener_score"],
            "fdv": t["fdv"],
            "volume_h24": t["volume_h24"],
            # Telegram
            "telegram_members": t["members"],
            "telegram_sentiment_score": t["sentiment_score"],
            "telegram_sentiment_label": t["sentiment_label"],
            "telegram_community": t["telegram_community"],
            # Twitter (standalone)
            "twitter_profile_score": prof_score,
            "twitter_followers": followers,
            "twitter_tweets_scraped": tw_tweets,
            "twitter_avg_likes": avg_likes,
            "twitter_search_score": search_score,
            "twitter_sentiment_score": tw_sent_score,
            "twitter_sentiment_label": tw_sent_label,
        }
        results.append(entry)

        # Print
        tg_s = f"{t['sentiment_score']:>5.1f}" if t["sentiment_score"] is not None else "    -"
        tw_s = f"{tw_sent_score:>5.1f}" if tw_sent_score is not None else "    -"

        print(
            f"#{t['rank']:>2} {sym:>10}  TG:{t['members']:>5}mbr {tg_s}({t['sentiment_label'][:4]:4})  "
            f"TW:{followers:>6}fll prof={prof_score:>4.1f} srch={search_score:>4.1f} {tw_s}({tw_sent_label[:4]:4})"
        )

    # Save
    OUTPUT_JSON.write_text(json.dumps(results, indent=2))

    # Summary table
    print(f"\n{'='*95}")
    print("  TELEGRAM + TWITTER ANALYSIS (sentiments kept separate)")
    print(f"{'='*95}")
    print(
        f"{'Rank':>4} {'Sym':>10} {'TG_Mbr':>7} {'TG_Sent':>8} {'TW_Fll':>7} {'TW_Prof':>7} "
        f"{'TW_Srch':>7} {'TW_Sent':>8} {'FDV':>12}"
    )
    print(f"{'-'*4} {'-'*10} {'-'*7} {'-'*8} {'-'*7} {'-'*7} {'-'*7} {'-'*8} {'-'*12}")

    for r in results:
        tg_s = f"{r['telegram_sentiment_score']:.0f}" if r["telegram_sentiment_score"] is not None else "-"
        tw_s = f"{r['twitter_sentiment_score']:.0f}" if r["twitter_sentiment_score"] is not None else "-"

        print(
            f"{r['rank']:>4} {r['symbol']:>10} {r['telegram_members']:>7,} {tg_s:>8} "
            f"{r['twitter_followers']:>7,} {r['twitter_profile_score']:>6.1f} "
            f"{r['twitter_search_score']:>6.1f} {tw_s:>8} {r['fdv']:>12,.0f}"
        )

    print(f"\nSaved to {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
