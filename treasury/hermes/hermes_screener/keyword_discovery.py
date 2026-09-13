"""
Trending Keyword Discovery — AI-powered token discovery from social signals.

Analyzes Telegram and Twitter text to find trending crypto keywords/subjects,
then uses Dexscreener search to discover new tokens related to those keywords.

Flow:
  1. Collect recent Telegram mention texts from DB
  2. Collect Twitter search results for known tokens
  3. Extract keywords via TF-IDF (or local LLM if available)
  4. Filter to crypto-relevant terms
  5. Search Dexscreener for tokens matching top 10 keywords
  6. Return newly discovered tokens for enrichment

Usage:
    from hermes_screener.keyword_discovery import run_keyword_discovery
    new_tokens = run_keyword_discovery(max_keywords=10)
"""

from __future__ import annotations

import json
import math
import re
import sqlite3
import subprocess
import time
from collections import Counter
from pathlib import Path
from typing import Any

import requests

from hermes_screener.config import settings
from hermes_screener.logging import get_logger
from hermes_screener.metrics import metrics

log = get_logger("keyword_discovery")

DB_PATH = settings.db_path

# ═══════════════════════════════════════════════════════════════════════════════
# TEXT COLLECTION
# ═══════════════════════════════════════════════════════════════════════════════

# Common English stop words + crypto noise
STOP_WORDS = {
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "shall",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "between",
    "out",
    "off",
    "over",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "just",
    "don",
    "now",
    "and",
    "but",
    "or",
    "if",
    "while",
    "about",
    "up",
    "it",
    "its",
    "this",
    "that",
    "these",
    "those",
    "i",
    "me",
    "my",
    "we",
    "our",
    "you",
    "your",
    "he",
    "him",
    "his",
    "she",
    "her",
    "they",
    "them",
    "their",
    "what",
    "which",
    "who",
    "whom",
    "get",
    "got",
    "like",
    "one",
    "also",
    "back",
    "going",
    "new",
    "see",
    "way",
    "make",
    "many",
    "time",
    "much",
    "well",
    "come",  # Crypto template noise (from Telegram scraper formatting)
    "token",
    "contract",
    "address",
    "solana",
    "ethereum",
    "base",
    "bsc",
    "chain",
    "chart",
    "buy",
    "sell",
    "trading",
    "trade",
    "dex",
    "pool",
    "pair",
    "https",
    "http",
    "www",
    "com",
    "io",
    "gg",
    "xyz",
    "0x",
    "pump",
    "raydium",
    "jupiter",
    "uniswap",
    "ca",
    "mc",
    "mcap",
    # Telegram template abbreviations (not real topics)
    "vol",
    "chg",
    "age",
    "fdv",
    "liq",
    "m5",
    "h1",
    "h6",
    "h24",
    "ath",
    "txns",
    "buys",
    "sells",
    "price",
    "total",
    "score",
    "risk",
    "level",
    "high",
    "low",
    "mid",
    "top",
    "bot",
    "hot",
    "trending",
    "signal",
    "alert",
    "call",
    "alpha",
}

# Crypto-relevant term patterns (boosted 2x in scoring)
CRYPTO_PATTERNS = re.compile(
    r"\b(?:meme|ai|artificial|intelligence|defi|nft|gaming|metaverse|"
    r"layer2|l2|zkevm|bridge|staking|yield|farming|dao|governance|"
    r"oracle|dex|perps|perpetual|launchpad|presale|fairlaunch|airdrop|"
    r"burn|mint|tokenomics|rwa|real.world.asset|depin|social.fi|"
    r"pay|infra|infrastructure|rollup|zkproof|privacy|cross.chain|"
    r"liquid.staking|restaking|lsd|lrt|nftfi|gamefi|move.to.earn|"
    r"play.to.earn|watch.to.earn|prediction.market|brc20|erc404|"
    r"drc20|ordinals|inscription|bitcoin|btc|eth|sol|bnb|matic|"
    r"xrp|ada|avax|dot|link|uni|aave|crv|maker|compound|lido|"
    r"arbitrum|optimism|polygon|avalanche|fantom|cronos|tron|"
    r"pepe|doge|shib|floki|bonk|wif|brett|mog|slerf|sloth|"
    r"cat|dog|frog|bear|bull|moon|rocket|gem|diamond|hands|"
    r"community|cto|dev.team|marketing|partnership|listing|"
    r"audit|kyc|doxxed|renounced|locked|burned|supply)\b",
    re.IGNORECASE,
)


def collect_telegram_texts(hours_back: int = 24) -> list[str]:
    """Collect recent Telegram message texts from the contracts DB."""
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    c = conn.cursor()

    cutoff = time.time() - (hours_back * 3600)
    c.execute(
        """
        SELECT DISTINCT message_text
        FROM telegram_contract_calls
        WHERE message_text IS NOT NULL
        AND length(message_text) > 20
        AND observed_at > ?
        ORDER BY observed_at DESC
        LIMIT 1000
    """,
        (cutoff,),
    )

    texts = [row[0] for row in c.fetchall() if row[0]]
    conn.close()

    log.info("telegram_texts_collected", count=len(texts), hours=hours_back)
    return texts


def collect_twitter_texts(symbols: list[str], max_per_symbol: int = 5) -> list[str]:
    """Search Twitter for token symbols and collect tweet texts."""
    texts = []

    for sym in symbols[:20]:  # limit to avoid rate limits
        if len(sym) < 2 or len(sym) > 12:
            continue

        search_term = f"${sym}" if len(sym) <= 8 else sym
        try:
            result = subprocess.run(
                [
                    "surf",
                    "search",
                    "twitter",
                    "--query",
                    search_term,
                    "--limit",
                    str(max_per_symbol),
                    "--raw",
                ],
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                tweets = data if isinstance(data, list) else data.get("results", data.get("tweets", []))
                for tweet in tweets if isinstance(tweets, list) else []:
                    if isinstance(tweet, dict):
                        text = tweet.get("text", tweet.get("content", ""))
                    elif isinstance(tweet, str):
                        text = tweet
                    else:
                        continue
                    if text and len(text) > 10:
                        texts.append(text)
        except Exception:
            continue

    log.info("twitter_texts_collected", count=len(texts))
    return texts


# ═══════════════════════════════════════════════════════════════════════════════
# KEYWORD EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════════


def extract_keywords_tfidf(texts: list[str], max_keywords: int = 10) -> list[tuple[str, float]]:
    """
    Extract trending keywords using TF-IDF-like scoring.

    Higher score = more frequent in recent texts AND rarer historically.
    """
    if not texts:
        return []

    # Tokenize all texts
    all_words = []
    doc_freq: Counter[str] = Counter()  # how many docs contain each word
    total_docs = len(texts)

    for text in texts:
        # Clean: lowercase, remove URLs, mentions, special chars
        text = re.sub(r"https?://\S+", "", text)
        text = re.sub(r"@\w+", "", text)
        text = re.sub(r"[^\w\s$]", " ", text)
        words = text.lower().split()

        # Filter: 3+ chars, not stop words, not pure numbers
        doc_words = set()
        for w in words:
            w = w.strip("$")
            if len(w) >= 3 and w not in STOP_WORDS and not w.isdigit():
                all_words.append(w)
                doc_words.add(w)

        for w in doc_words:
            doc_freq[w] += 1

    # Term frequency (overall)
    tf = Counter(all_words)

    # TF-IDF scoring
    scores = {}
    for word, count in tf.items():
        if count < 2:  # must appear at least twice
            continue
        # IDF: penalize words that appear in too many docs
        df = doc_freq[word]
        idf = math.log(total_docs / max(df, 1))
        # TF-IDF with boost for crypto-relevant terms
        base_score = count * idf
        if CRYPTO_PATTERNS.search(word):
            base_score *= 2.0
        # Boost for $ prefixed (likely token ticker)
        scores[word] = base_score

    # Sort by score
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    # Filter out too-common single-char or very generic words
    filtered = [(word, score) for word, score in ranked if len(word) >= 3 and word.isalpha()]

    return filtered[:max_keywords]


def extract_keywords_llm(texts: list[str], max_keywords: int = 10) -> list[tuple[str, float]] | None:
    """
    Use local LLM to extract trending keywords from collected texts.
    Falls back to None if LLM is unavailable.
    """
    # Try local Ollama first
    try:
        sample = "\n".join(texts[:50])[:3000]  # limit context
        r = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "llama3.2",
                "prompt": f"""Analyze these crypto social media posts and extract the top {max_keywords} trending keywords or subjects.
Return ONLY a JSON array of objects with "keyword" and "relevance" (0-100).

Posts:
{sample}

JSON:""",
                "stream": False,
                "options": {"temperature": 0.2, "num_predict": 200},
            },
            timeout=30,
        )
        if r.status_code == 200:
            content = r.json().get("response", "")
            # Extract JSON from response
            json_match = re.search(r"\[.*?\]", content, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                return [(item["keyword"], item.get("relevance", 50)) for item in data[:max_keywords]]
    except Exception:
        pass

    # Try Bonsai-8B on port 8080
    try:
        sample = "\n".join(texts[:30])[:2000]
        r = requests.post(
            "http://localhost:8080/v1/chat/completions",
            json={
                "model": "Bonsai-8B.gguf",
                "messages": [
                    {
                        "role": "system",
                        "content": 'Extract trending crypto keywords from text. Return JSON array: [{"keyword": "...", "relevance": 0-100}]',
                    },
                    {
                        "role": "user",
                        "content": f"Top {max_keywords} trending keywords from:\n\n{sample}",
                    },
                ],
                "max_tokens": 200,
                "temperature": 0.2,
            },
            timeout=60,
        )
        if r.status_code == 200:
            content = r.json().get("choices", [{}])[0].get("message", {}).get("content", "")
            json_match = re.search(r"\[.*?\]", content, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                return [(item["keyword"], item.get("relevance", 50)) for item in data[:max_keywords]]
    except Exception:
        pass

    return None


# ═══════════════════════════════════════════════════════════════════════════════
# DEXSCREENER KEYWORD SEARCH
# ═══════════════════════════════════════════════════════════════════════════════


def search_dexscreener_keyword(keyword: str, max_results: int = 10) -> list[dict]:
    """Search Dexscreener for tokens matching a keyword."""
    try:
        r = requests.get(
            "https://api.dexscreener.com/latest/dex/search",
            params={"q": keyword},
            timeout=10,
        )
        if r.status_code != 200:
            return []

        data = r.json()
        pairs = data.get("pairs", [])[:max_results]

        tokens = []
        seen_addresses = set()
        for pair in pairs:
            base = pair.get("baseToken", {})
            addr = base.get("address", "")
            if addr and addr not in seen_addresses:
                seen_addresses.add(addr)
                liquidity = pair.get("liquidity", {}).get("usd", 0) or 0
                fdv = pair.get("fdv", 0) or 0
                volume = pair.get("volume", {}).get("h24", 0) or 0

                tokens.append(
                    {
                        "contract_address": addr,
                        "chain": pair.get("chainId", "unknown"),
                        "symbol": base.get("symbol", ""),
                        "name": base.get("name", ""),
                        "fdv": fdv,
                        "liquidity_usd": liquidity,
                        "volume_h24": volume,
                        "dex": pair.get("dexId", ""),
                        "pair_address": pair.get("pairAddress", ""),
                        "dex_url": f"https://dexscreener.com/{pair.get('chainId','')}/{pair.get('pairAddress','')}",
                        "price_usd": pair.get("priceUsd"),
                        "discovered_via_keyword": keyword,
                    }
                )

        return tokens
    except Exception:
        return []


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════


def run_keyword_discovery(
    max_keywords: int = 10,
    max_tokens_per_keyword: int = 10,
    hours_back: int = 24,
    use_llm: bool = True,
    existing_addresses: set | None = None,
) -> dict[str, Any]:
    """
    Discover new tokens from trending social keywords.

    Args:
        max_keywords: How many trending keywords to extract
        max_tokens_per_keyword: Max tokens to find per keyword
        hours_back: How far back to look in Telegram data
        use_llm: Try local LLM first, fall back to TF-IDF
        existing_addresses: Set of already-known token addresses (skip these)
    """
    start = time.time()
    existing_addresses = existing_addresses or set()

    log.info("keyword_discovery_start", max_keywords=max_keywords, hours_back=hours_back)

    # Step 1: Collect social text
    tg_texts = collect_telegram_texts(hours_back)

    # Get current token symbols for Twitter search
    try:
        conn = sqlite3.connect(str(DB_PATH), timeout=30)
        c = conn.cursor()
        c.execute("SELECT DISTINCT contract_address FROM telegram_contracts_unique LIMIT 50")
        {row[0] for row in c.fetchall()}
        conn.close()
    except Exception:
        pass

    # Collect Twitter texts for known symbols (from enrichment)
    tw_texts = []
    try:
        top100_path = settings.output_path
        if top100_path.exists():
            with open(top100_path) as f:
                tokens = json.load(f).get("tokens", [])
            symbols = [t.get("symbol", "") for t in tokens if t.get("symbol")]
            tw_texts = collect_twitter_texts(symbols)
    except Exception:
        pass

    all_texts = tg_texts + tw_texts
    log.info(
        "texts_collected",
        telegram=len(tg_texts),
        twitter=len(tw_texts),
        total=len(all_texts),
    )

    if not all_texts:
        log.warning("no_texts_collected")
        return {"status": "no_data", "keywords": [], "tokens": [], "elapsed": 0}

    # Step 2: Extract keywords
    keywords = None
    method = "tfidf"

    if use_llm:
        keywords = extract_keywords_llm(all_texts, max_keywords)
        if keywords:
            method = "llm"

    if not keywords:
        keywords = extract_keywords_tfidf(all_texts, max_keywords)
        method = "tfidf"

    log.info(
        "keywords_extracted",
        method=method,
        count=len(keywords),
        top5=[(k, round(s, 1)) for k, s in keywords[:5]],
    )

    # Step 3: Search Dexscreener for each keyword
    all_discovered = []
    for keyword, score in keywords:
        tokens = search_dexscreener_keyword(keyword, max_tokens_per_keyword)
        # Filter out already-known tokens
        new_tokens = [t for t in tokens if t["contract_address"] not in existing_addresses]
        for t in new_tokens:
            t["keyword_score"] = round(score, 1)
        all_discovered.extend(new_tokens)
        metrics.api_calls.labels(provider="dexscreener_keyword", status="ok" if tokens else "empty").inc()

    # Deduplicate by address
    seen = set()
    unique_discovered = []
    for t in all_discovered:
        addr = t["contract_address"]
        if addr not in seen:
            seen.add(addr)
            unique_discovered.append(t)

    # Sort by combined keyword relevance + volume
    for t in unique_discovered:
        t["discovery_score"] = round(
            (t.get("keyword_score", 0) * 0.4)
            + (min(t.get("volume_h24", 0) / 100000, 30))
            + (min(t.get("fdv", 0) / 100000, 20)),
            2,
        )
    unique_discovered.sort(key=lambda t: t.get("discovery_score", 0), reverse=True)

    elapsed = time.time() - start

    result = {
        "status": "ok",
        "keywords": [{"keyword": k, "score": round(s, 1)} for k, s in keywords],
        "tokens_discovered": len(unique_discovered),
        "tokens": unique_discovered[:50],  # cap output
        "method": method,
        "elapsed": round(elapsed, 1),
    }

    log.info(
        "keyword_discovery_done",
        keywords=len(keywords),
        discovered=len(unique_discovered),
        method=method,
        elapsed=round(elapsed, 1),
    )

    return result


def save_discovered_tokens(tokens: list[dict]) -> Path:
    """Save discovered tokens to a file for the enricher to pick up."""
    output_path = settings.hermes_home / "data" / "token_screener" / "keyword_discoveries.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Append to existing (don't overwrite)
    existing = []
    if output_path.exists():
        try:
            with open(output_path) as f:
                existing = json.load(f).get("tokens", [])
        except Exception:
            pass

    # Merge, deduplicate
    seen = {t["contract_address"] for t in existing}
    for t in tokens:
        if t["contract_address"] not in seen:
            existing.append(t)
            seen.add(t["contract_address"])

    # Keep latest 500
    existing = existing[-500:]

    with open(output_path, "w") as f:
        json.dump(
            {
                "generated_at": time.time(),
                "total": len(existing),
                "tokens": existing,
            },
            f,
            indent=2,
            default=str,
        )

    log.info("discoveries_saved", path=str(output_path), total=len(existing))
    return output_path
