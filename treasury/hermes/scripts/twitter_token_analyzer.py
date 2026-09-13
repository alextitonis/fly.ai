#!/usr/bin/env python3
"""
Token Twitter Profile & Search Analyzer (Layer 13)

For each top 10 token:
  1. Visit token's Twitter profile via nitter -> analyze quality/quantity over time
  2. Search for $TICKER -> analyze mention quality/quantity
  3. Search for token name -> analyze mention quality/quantity

Uses nitter.tiekoetter.com + nitter.poast.org via Playwright selectors.
"""

import json
import math
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path.home() / ".hermes" / "data" / "token_screener"
TOP100_PATH = DATA_DIR / "top100.json"
OUTPUT_PATH = DATA_DIR / "twitter_token_analysis.json"

NITTER_INSTANCES = [
    "https://nitter.tiekoetter.com",
    "https://nitter.poast.org",
]
REQUEST_DELAY = 3.0


@dataclass
class Tweet:
    text: str = ""
    author: str = ""
    timestamp: str = ""
    likes: int = 0
    reposts: int = 0
    replies: int = 0

    @property
    def engagement(self):
        return self.likes + 2 * self.reposts + 0.5 * self.replies


@dataclass
class ProfileAnalysis:
    handle: str = ""
    exists: bool = False
    display_name: str = ""
    bio: str = ""
    followers: int = 0
    following: int = 0
    total_tweets: int = 0
    account_age_days: int = 0
    join_date: str = ""
    tweets_scraped: int = 0
    tweets_last_7d: int = 0
    tweets_last_30d: int = 0
    avg_likes: float = 0.0
    avg_reposts: float = 0.0
    avg_replies: float = 0.0
    posting_freq_per_day: float = 0.0
    profile_quality_score: float = 0.0
    profile_url: str = ""


@dataclass
class SearchAnalysis:
    query: str = ""
    tweets_found: int = 0
    unique_authors: int = 0
    total_engagement: int = 0
    avg_engagement: float = 0.0
    tweets_last_7d: int = 0
    tweets_last_30d: int = 0
    mention_velocity: float = 0.0
    top_tweet_text: str = ""
    top_tweet_engagement: float = 0.0
    search_quality_score: float = 0.0


@dataclass
class TokenTwitterAnalysis:
    symbol: str = ""
    name: str = ""
    contract_address: str = ""
    chain: str = ""
    profile: ProfileAnalysis = field(default_factory=ProfileAnalysis)
    ticker_search: SearchAnalysis = field(default_factory=SearchAnalysis)
    name_search: SearchAnalysis = field(default_factory=SearchAnalysis)
    twitter_sentiment: dict = field(default_factory=dict)
    combined_score: float = 0.0
    analyzed_at: str = ""


def parse_n(s: str) -> int:
    s = s.strip().replace(",", "")
    if not s:
        return 0
    for suf, m in [("B", 1e9), ("M", 1e6), ("K", 1e3)]:
        if s.upper().endswith(suf):
            try:
                return int(float(s[:-1]) * m)
            except ValueError:
                return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


# ── Sentiment Keywords ──────────────────────────────────────────────────────
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
    "free money",
    "partnership",
    "listing",
    "listed",
    "announcement",
    "launch",
    "launched",
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
    "fake",
    "fraud",
    "steal",
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


def compute_sentiment(tweets: list) -> dict:
    """Keyword-based sentiment scoring (-100 to +100), mirrors Dexscreener approach."""
    if not tweets:
        return {
            "sentiment_score": None,
            "sentiment_label": "-",
            "bullish": 0,
            "bearish": 0,
            "neutral": 0,
            "analyzed": 0,
        }

    bull, bear, neutral = 0, 0, 0
    total = 0.0
    for t in tweets:
        text = (t.text if hasattr(t, "text") else t.get("text", "")).lower()
        words = set(re.findall(r"\b\w+\b", text))
        wl = list(words)
        bigrams = {f"{wl[i]} {wl[i+1]}" for i in range(len(wl) - 1)}
        bh = len(words & BULLISH_WORDS) + len(bigrams & BULLISH_WORDS)
        brh = len(words & BEARISH_WORDS) + len(bigrams & BEARISH_WORDS)
        if bh > brh:
            bull += 1
            total += min(1.0, bh * 0.3)
        elif brh > bh:
            bear += 1
            total -= min(1.0, brh * 0.3)
        else:
            neutral += 1

    n = len(tweets)
    score = round(total / n * 100, 1) if n else 0.0
    if score > 60:
        label = "very_positive"
    elif score > 20:
        label = "positive"
    elif score > -20:
        label = "neutral"
    elif score > -60:
        label = "negative"
    else:
        label = "very_negative"

    return {
        "sentiment_score": score,
        "sentiment_label": label,
        "bullish": bull,
        "bearish": bear,
        "neutral": neutral,
        "analyzed": n,
    }


def time_ago_days(ts: str) -> float | None:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).total_seconds() / 86400
    except ValueError:
        return None


def goto_nitter(page, path: str) -> bool:
    """Navigate to a nitter page, try all instances."""
    for base in NITTER_INSTANCES:
        try:
            page.goto(f"{base}{path}", wait_until="domcontentloaded", timeout=15000)
            time.sleep(3)
            html = page.content()
            if "timeline-item" in html or "profile-card" in html:
                return True
            # anti-bot? wait more
            body = page.inner_text("body")
            if "bot" in body.lower() or "verif" in body.lower():
                time.sleep(8)
                if "timeline-item" in page.content() or "profile-card" in page.content():
                    return True
        except Exception:
            continue
    return False


def extract_tweets(page) -> list[Tweet]:
    """Extract tweets from current nitter page using Playwright selectors."""
    tweets = []
    items = page.query_selector_all(".timeline-item")

    for item in items:
        tweet = Tweet()

        el = item.query_selector(".tweet-content")
        if el:
            tweet.text = el.inner_text().strip()

        el = item.query_selector(".username")
        if el:
            tweet.author = el.inner_text().strip().lstrip("@")

        el = item.query_selector(".tweet-date a")
        if el:
            ts = el.get_attribute("title") or ""
            if ts:
                try:
                    from email.utils import parsedate_to_datetime

                    tweet.timestamp = parsedate_to_datetime(ts).isoformat()
                except (TypeError, ValueError):
                    tweet.timestamp = ts

        # Engagement: .tweet-stat > .icon-container > span.icon-*
        stat_els = item.query_selector_all(".tweet-stat")
        for stat in stat_els:
            container = stat.query_selector(".icon-container")
            if not container:
                continue
            text = container.inner_text().strip()
            # Get the icon span (direct child, not the container itself)
            icon = container.query_selector('span[class*="icon-"]')
            if not icon:
                continue
            cls = icon.get_attribute("class") or ""
            num = parse_n(text)
            if "comment" in cls:
                tweet.replies = num
            elif "retweet" in cls:
                tweet.reposts = num
            elif "heart" in cls or "like" in cls:
                tweet.likes = num

        if tweet.text:
            tweets.append(tweet)

    return tweets


def analyze_profile(handle: str, page) -> ProfileAnalysis:
    """Analyze a Twitter profile via nitter."""
    a = ProfileAnalysis(handle=handle, profile_url=f"https://x.com/{handle}")

    if not goto_nitter(page, f"/{handle}"):
        return a

    body = page.inner_text("body")
    if len(body) < 100:
        return a

    a.exists = True

    # Profile fields via selectors
    el = page.query_selector(".profile-card-fullname")
    if el:
        a.display_name = el.inner_text().strip()

    el = page.query_selector(".profile-bio")
    if el:
        a.bio = el.inner_text().strip()[:200]

        # Profile stats: 4 .profile-stat-num elements = [Tweets, Following, Followers, Likes]
        stat_nums = page.query_selector_all(".profile-stat-num")
        if len(stat_nums) >= 3:
            a.total_tweets = parse_n(stat_nums[0].inner_text())
            a.following = parse_n(stat_nums[1].inner_text())
            a.followers = parse_n(stat_nums[2].inner_text())

    # Join date
    m = re.search(r"Joined\s+(\w+\s+\d{4})", body)
    if m:
        a.join_date = m.group(1)
        try:
            join_dt = datetime.strptime(a.join_date, "%B %Y")
            a.account_age_days = (datetime.now() - join_dt).days
        except ValueError:
            pass

    # Extract tweets
    tweets = extract_tweets(page)
    a.tweets_scraped = len(tweets)

    datetime.now(timezone.utc)
    all_ages = []
    for t in tweets:
        d = time_ago_days(t.timestamp)
        if d is not None:
            if d <= 7:
                a.tweets_last_7d += 1
            if d <= 30:
                a.tweets_last_30d += 1
            all_ages.append(d)

    if tweets:
        a.avg_likes = sum(t.likes for t in tweets) / len(tweets)
        a.avg_reposts = sum(t.reposts for t in tweets) / len(tweets)
        a.avg_replies = sum(t.replies for t in tweets) / len(tweets)

    if len(all_ages) >= 2:
        span = max(1, max(all_ages) - min(all_ages))
        a.posting_freq_per_day = len(all_ages) / span

    # Quality score
    score = 0.0
    if a.followers > 0:
        score += min(25, 8 * math.log10(a.followers))
    if a.account_age_days > 365:
        score += 15
    elif a.account_age_days > 90:
        score += 10
    if a.posting_freq_per_day >= 1:
        score += 15
    elif a.posting_freq_per_day >= 0.3:
        score += 10
    if a.avg_likes > 100:
        score += 20
    elif a.avg_likes > 10:
        score += 10
    elif a.avg_likes > 0:
        score += 5
    if a.tweets_last_7d >= 3:
        score += 20
    elif a.tweets_last_7d >= 1:
        score += 10
    if a.total_tweets > 100:
        score += 5
    a.profile_quality_score = round(min(100, score), 1)

    return a


def analyze_search(query: str, tweets: list[Tweet]) -> SearchAnalysis:
    a = SearchAnalysis(query=query, tweets_found=len(tweets))
    if not tweets:
        return a

    a.unique_authors = len(set(t.author for t in tweets if t.author))
    engs = [t.engagement for t in tweets]
    a.total_engagement = int(sum(engs))
    a.avg_engagement = sum(engs) / len(engs)

    for t in tweets:
        d = time_ago_days(t.timestamp)
        if d is not None:
            if d <= 7:
                a.tweets_last_7d += 1
            if d <= 30:
                a.tweets_last_30d += 1

    if engs:
        best = max(range(len(tweets)), key=lambda i: engs[i])
        a.top_tweet_text = tweets[best].text[:120]
        a.top_tweet_engagement = engs[best]

    if a.tweets_last_30d > 0:
        a.mention_velocity = a.tweets_last_30d / 30.0

    score = min(30, 15 * math.log10(len(tweets) + 1))
    score += min(25, 10 * math.log10(a.unique_authors + 1))
    score += min(25, 10 * math.log10(a.avg_engagement + 1))
    score += min(20, 20 * a.mention_velocity)
    a.search_quality_score = round(min(100, score), 1)
    return a


def main():
    from playwright.sync_api import sync_playwright

    data = json.loads(TOP100_PATH.read_text())
    tokens = data.get("tokens", [])[:10]

    print("=== Twitter Profile & Search Analyzer ===")
    print(f"Instances: {', '.join(NITTER_INSTANCES)}")
    print(f"Tokens: {len(tokens)}\n")

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 2000},
        )
        page = ctx.new_page()

        for i, tok in enumerate(tokens):
            sym = tok.get("symbol", "?").upper()
            name = tok.get("name", sym)
            tw_url = tok.get("twitter_url", "")
            contract = tok.get("contract_address", "")
            chain = tok.get("chain", "")

            print(f"[{i+1}/{len(tokens)}] ${sym} ({name})")

            # Extract handle
            handle = ""
            if tw_url:
                m = re.search(r"x\.com/([A-Za-z0-9_]+)", tw_url)
                if m and m.group(1) not in ("search", "i"):
                    handle = m.group(1)

            analysis = TokenTwitterAnalysis(
                symbol=sym,
                name=name,
                contract_address=contract,
                chain=chain,
                analyzed_at=datetime.now(timezone.utc).isoformat(),
            )

            # Collect all tweets for sentiment
            all_tweets = []

            # 1. Profile
            if handle:
                print(f"  Profile: @{handle}")
                time.sleep(REQUEST_DELAY)
                analysis.profile = analyze_profile(handle, page)
                p = analysis.profile
                print(
                    f"    {p.display_name}  followers={p.followers:,}  tweets={p.total_tweets}  "
                    f"scraped={p.tweets_scraped}  7d={p.tweets_last_7d}  age={p.account_age_days}d  "
                    f"avg_likes={p.avg_likes:.0f}  quality={p.profile_quality_score}"
                )
            else:
                print(f"  Profile: no handle (url={tw_url[:60]})")

            # 2. $TICKER search
            ticker_q = f"${sym}"
            print(f"  Search: {ticker_q}")
            time.sleep(REQUEST_DELAY)
            ticker_tweets = []
            if goto_nitter(page, f"/search?f=tweets&q={re.escape(ticker_q)}"):
                ticker_tweets = extract_tweets(page)
                analysis.ticker_search = analyze_search(ticker_q, ticker_tweets)
                ts = analysis.ticker_search
                print(
                    f"    {ts.tweets_found} tweets  {ts.unique_authors} authors  "
                    f"7d={ts.tweets_last_7d}  quality={ts.search_quality_score}"
                )
            else:
                print("    nitter unavailable")

            # 3. Name search
            name_tweets = []
            if name and name != sym and len(name) > 2:
                print(f"  Search: {name}")
                time.sleep(REQUEST_DELAY)
                if goto_nitter(page, f'/search?f=tweets&q={name.replace(" ", "+")}'):
                    name_tweets = extract_tweets(page)
                    analysis.name_search = analyze_search(name, name_tweets)
                    ns = analysis.name_search
                    print(
                        f"    {ns.tweets_found} tweets  {ns.unique_authors} authors  "
                        f"7d={ns.tweets_last_7d}  quality={ns.search_quality_score}"
                    )

            # 4. Sentiment from all tweets
            all_tweets = ticker_tweets + name_tweets
            analysis.twitter_sentiment = compute_sentiment(all_tweets)
            sent = analysis.twitter_sentiment
            ss = sent["sentiment_score"]
            sl = sent["sentiment_label"]
            print(
                f"  Sentiment: {ss} ({sl})  [{sent['bullish']}B/{sent['bearish']}R/{sent['neutral']}N of {sent['analyzed']}]"
                if ss is not None
                else "  Sentiment: no data"
            )

            analysis.combined_score = round(
                0.40 * analysis.profile.profile_quality_score
                + 0.35 * analysis.ticker_search.search_quality_score
                + 0.25 * analysis.name_search.search_quality_score,
                1,
            )
            print(f"  Combined: {analysis.combined_score}\n")
            results.append(asdict(analysis))

        browser.close()

    OUTPUT_PATH.write_text(json.dumps(results, indent=2))

    print(f"{'='*88}")
    print(
        f"{'Sym':>10} {'Profile':>10} {'Follow':>8} {'Twt':>5} {'7d':>4} {'AvgLike':>8} "
        f"{'$Search':>8} {'$N':>4} {'NameQ':>6} {'Comb':>6}"
    )
    print(f"{'-'*10} {'-'*10} {'-'*8} {'-'*5} {'-'*4} {'-'*8} {'-'*8} {'-'*4} {'-'*6} {'-'*6}")
    for r in sorted(results, key=lambda x: -x["combined_score"]):
        p, ts, ns = r["profile"], r["ticker_search"], r["name_search"]
        print(
            f"{r['symbol']:>10} {p['profile_quality_score']:>9.1f} {p['followers']:>8,} "
            f"{p['tweets_scraped']:>5} {p['tweets_last_7d']:>4} {p['avg_likes']:>8.0f} "
            f"{ts['search_quality_score']:>7.1f} {ts['tweets_found']:>4} "
            f"{ns['search_quality_score']:>5.1f} {r['combined_score']:>6.1f}"
        )

    print(f"\nSaved: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
