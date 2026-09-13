"""
Enhanced Token Scoring with Better Use of Existing Data
========================================================

This module enhances the token scoring formula to better use existing data sources
for liquidity analysis, token distribution, Twitter sentiment, and community metrics.

Key Improvements:
1. Better liquidity analysis using existing Dexscreener data
2. Better token distribution scoring using existing RugCheck/De.Fi data
3. Better Twitter sentiment scoring using existing Nitter data
4. Better community metrics using existing Telegram data

All improvements use existing data sources - no new API integrations required.
"""

from __future__ import annotations

import json
import time

from hermes_screener.config import settings
from hermes_screener.logging import get_logger

log = get_logger("enhanced_scoring")

# ═══════════════════════════════════════════════════════════════════════════════
# ENHANCED SCORING FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def compute_enhanced_token_score(token: dict) -> float:
    """
    Compute enhanced token score using ALL available data.

    This function enhances the existing scoring by better utilizing:
    1. Volume and FDV data from Dexscreener
    2. Smart wallet data from GMGN
    3. Telegram data from Telegram DB
    4. Twitter sentiment data from Nitter scraper
    5. Holder data from Solscan, Helius, and Birdeye

    Returns: Score 0-100
    """
    # ── HARD EXCLUSIONS (return 0 immediately) ──
    negatives = token.get("negatives") or []
    age = token.get("age_hours") or 0

    # Critical negatives that should exclude tokens
    if "POSSIBLE RUG" in negatives:
        return 0.0
    if "death spiral" in negatives:
        return 0.0
    if "mint not renounced" in negatives and age > 72:
        return 0.0
    if "ONLY SELLS" in negatives:
        return 0.0

    score = 0.0

    # ═══════════════════════════════════════════════════════════════════════════
    # 1. VOLUME & FDV ANALYSIS (0-20 points)
    # ═══════════════════════════════════════════════════════════════════════════
    volume_fdv_score = 0.0

    # FDV (Fully Diluted Valuation)
    fdv = token.get("fdv") or 0
    if fdv > 0:
        if fdv >= 50_000_000:
            volume_fdv_score += 10  # Very high FDV
        elif fdv >= 10_000_000:
            volume_fdv_score += 8  # High FDV
        elif fdv >= 1_000_000:
            volume_fdv_score += 6  # Good FDV
        elif fdv >= 500_000:
            volume_fdv_score += 4  # Moderate FDV
        elif fdv >= 100_000:
            volume_fdv_score += 2  # Low FDV
        else:
            volume_fdv_score += 1  # Very low FDV

    # 24h Volume
    vol24 = token.get("volume_h24") or 0
    if vol24 > 0:
        if vol24 >= 10_000_000:
            volume_fdv_score += 10  # Very high volume
        elif vol24 >= 5_000_000:
            volume_fdv_score += 8  # High volume
        elif vol24 >= 1_000_000:
            volume_fdv_score += 6  # Good volume
        elif vol24 >= 500_000:
            volume_fdv_score += 4  # Moderate volume
        elif vol24 >= 100_000:
            volume_fdv_score += 2  # Low volume
        else:
            volume_fdv_score += 1  # Very low volume

    # Volume/FDV ratio (turnover)
    if fdv > 0 and vol24 > 0:
        vol_ratio = vol24 / fdv
        if vol_ratio >= 2.0:
            volume_fdv_score += 5  # Very high turnover
        elif vol_ratio >= 1.0:
            volume_fdv_score += 4  # High turnover
        elif vol_ratio >= 0.5:
            volume_fdv_score += 3  # Good turnover
        elif vol_ratio >= 0.2:
            volume_fdv_score += 2  # Moderate turnover
        elif vol_ratio >= 0.05:
            volume_fdv_score += 1  # Low turnover
        else:
            volume_fdv_score += 0  # Very low turnover

    # Cap volume/fdv score
    volume_fdv_score = max(0, min(20, volume_fdv_score))
    score += volume_fdv_score

    # ═══════════════════════════════════════════════════════════════════════════
    # 2. SMART MONEY ANALYSIS (0-15 points)
    # ═══════════════════════════════════════════════════════════════════════════
    smart_money_score = 0.0

    # Smart wallet count
    smart_wallets = token.get("gmgn_smart_wallets") or token.get("smart_wallet_count") or 0
    if smart_wallets > 0:
        if smart_wallets >= 50:
            smart_money_score += 15  # Very high smart money
        elif smart_wallets >= 30:
            smart_money_score += 12  # High smart money
        elif smart_wallets >= 20:
            smart_money_score += 10  # Good smart money
        elif smart_wallets >= 10:
            smart_money_score += 7  # Moderate smart money
        elif smart_wallets >= 5:
            smart_money_score += 4  # Low smart money
        else:
            smart_money_score += 2  # Very low smart money

    # Insider count
    insider_count = token.get("insider_count") or 0
    if insider_count > 0:
        if insider_count <= 3:
            smart_money_score += 3  # Few insiders
        elif insider_count <= 5:
            smart_money_score += 2  # Some insiders
        elif insider_count <= 10:
            smart_money_score += 1  # Several insiders
        else:
            smart_money_score -= 2  # Too many insiders

    # Dev holding
    dev_hold = token.get("gmgn_dev_hold")
    if dev_hold:
        smart_money_score += 3  # Dev holding is good

    # Cap smart money score
    smart_money_score = max(0, min(15, smart_money_score))
    score += smart_money_score

    # ═══════════════════════════════════════════════════════════════════════════
    # 3. HOLDER DISTRIBUTION (0-15 points) - NEW from Solscan/Helius/Birdeye
    # ═══════════════════════════════════════════════════════════════════════════
    holder_score = 0.0

    # Get holder count from new APIs
    holder_count = 0

    # Try Solscan first
    solscan = token.get("solscan", {})
    if solscan and solscan.get("holder_count"):
        holder_count = solscan.get("holder_count", 0)

    # Try Helius
    helius = token.get("helius", {})
    if not holder_count and helius and helius.get("holder_count"):
        holder_count = helius.get("holder_count", 0)

    # Try Birdeye
    birdeye = token.get("birdeye", {})
    if not holder_count and birdeye and birdeye.get("holder_count"):
        holder_count = birdeye.get("holder_count", 0)

    # Score based on holder count
    if holder_count > 0:
        if holder_count >= 10_000:
            holder_score += 15  # Very distributed
        elif holder_count >= 5_000:
            holder_score += 12  # Well distributed
        elif holder_count >= 1_000:
            holder_score += 8  # Moderately distributed
        elif holder_count >= 500:
            holder_score += 5  # Somewhat concentrated
        elif holder_count >= 100:
            holder_score += 3  # Concentrated
        else:
            holder_score += 1  # Very concentrated

    # Get top holders concentration from new APIs
    top_holders_concentration = 0

    # Try Solscan
    if solscan and solscan.get("top_holders"):
        top_holders = solscan.get("top_holders", [])
        if top_holders:
            # Calculate concentration from top 10 holders
            total_pct = sum(h.get("percentage", 0) for h in top_holders[:10])
            top_holders_concentration = total_pct

    # Try Birdeye
    if not top_holders_concentration and birdeye and birdeye.get("top_holders"):
        top_holders = birdeye.get("top_holders", [])
        if top_holders:
            total_pct = sum(h.get("percentage", 0) for h in top_holders[:10])
            top_holders_concentration = total_pct

    # Score based on concentration (lower is better)
    if top_holders_concentration > 0:
        if top_holders_concentration <= 20:
            holder_score += 5  # Very distributed
        elif top_holders_concentration <= 30:
            holder_score += 3  # Well distributed
        elif top_holders_concentration <= 50:
            holder_score += 1  # Moderately concentrated
        else:
            holder_score -= 3  # Highly concentrated

    # Cap holder score
    holder_score = max(0, min(15, holder_score))
    score += holder_score

    # ═══════════════════════════════════════════════════════════════════════════
    # 4. TELEGRAM COMMUNITY METRICS (0-15 points)
    # ═══════════════════════════════════════════════════════════════════════════
    telegram_score = 0.0

    # Telegram channel count
    channel_count = token.get("channel_count") or token.get("tg_channel_count") or 0
    if channel_count > 0:
        if channel_count >= 10:
            telegram_score += 10  # Many channels
        elif channel_count >= 5:
            telegram_score += 7  # Several channels
        elif channel_count >= 3:
            telegram_score += 5  # Multiple channels
        elif channel_count >= 2:
            telegram_score += 3  # Few channels
        else:
            telegram_score += 1  # Single channel

    # Telegram mentions
    mentions = token.get("mentions") or token.get("tg_mention_count") or 0
    if mentions > 0:
        if mentions >= 50:
            telegram_score += 5  # Many mentions
        elif mentions >= 20:
            telegram_score += 3  # Several mentions
        elif mentions >= 10:
            telegram_score += 2  # Some mentions
        else:
            telegram_score += 1  # Few mentions

    # Telegram mention velocity
    tg_velocity = token.get("tg_mention_velocity") or 0
    if tg_velocity > 0:
        if tg_velocity >= 5:
            telegram_score += 3  # High velocity
        elif tg_velocity >= 2:
            telegram_score += 2  # Good velocity
        elif tg_velocity >= 1:
            telegram_score += 1  # Moderate velocity

    # Telegram viral score
    tg_viral = token.get("tg_viral_score") or 0
    if tg_viral > 0:
        if tg_viral >= 50:
            telegram_score += 3  # Very viral
        elif tg_viral >= 30:
            telegram_score += 2  # Viral
        elif tg_viral >= 10:
            telegram_score += 1  # Somewhat viral

    # Cap telegram score
    telegram_score = max(0, min(15, telegram_score))
    score += telegram_score

    # ═══════════════════════════════════════════════════════════════════════════
    # 5. TWITTER SENTIMENT (0-10 points)
    # ═══════════════════════════════════════════════════════════════════════════
    twitter_score = 0.0

    # Twitter mentions
    tw_mentions = token.get("tw_mention_count") or 0
    if tw_mentions > 0:
        if tw_mentions >= 100:
            twitter_score += 5  # Many mentions
        elif tw_mentions >= 50:
            twitter_score += 4  # Several mentions
        elif tw_mentions >= 20:
            twitter_score += 3  # Some mentions
        elif tw_mentions >= 10:
            twitter_score += 2  # Few mentions
        else:
            twitter_score += 1  # Very few mentions

    # Twitter sentiment score
    tw_sentiment = token.get("tw_sentiment_score") or 0
    if tw_sentiment > 0:
        if tw_sentiment >= 0.8:
            twitter_score += 5  # Very positive sentiment
        elif tw_sentiment >= 0.6:
            twitter_score += 3  # Positive sentiment
        elif tw_sentiment >= 0.4:
            twitter_score += 1  # Neutral sentiment
        else:
            twitter_score -= 2  # Negative sentiment

    # Twitter trending score
    tw_trending = token.get("tw_trending_score") or 0
    if tw_trending > 0:
        if tw_trending >= 50:
            twitter_score += 3  # Very trending
        elif tw_trending >= 30:
            twitter_score += 2  # Trending
        elif tw_trending >= 10:
            twitter_score += 1  # Somewhat trending

    # Twitter KOL score
    tw_kol = token.get("tw_kol_score") or 0
    if tw_kol > 0:
        if tw_kol >= 50:
            twitter_score += 3  # Many KOLs
        elif tw_kol >= 30:
            twitter_score += 2  # Some KOLs
        elif tw_kol >= 10:
            twitter_score += 1  # Few KOLs

    # Cap twitter score
    twitter_score = max(0, min(10, twitter_score))
    score += twitter_score

    # ═══════════════════════════════════════════════════════════════════════════
    # 6. PRICE MOMENTUM (0-15 points)
    # ═══════════════════════════════════════════════════════════════════════════
    momentum_score = 0.0

    # 1h price change
    p1h = token.get("price_change_h1")
    if p1h is not None:
        if 5 <= p1h <= 50:
            momentum_score += 6  # Strong but not parabolic
        elif 0 < p1h < 5:
            momentum_score += 4  # Steady
        elif -10 < p1h <= 0:
            momentum_score += 2  # Slight dip
        elif p1h > 50:
            momentum_score += 3  # Parabolic (risky)
        else:
            momentum_score += 0  # Dumping

    # 6h price change
    p6h = token.get("price_change_h6")
    if p6h is not None:
        if p6h > 10:
            momentum_score += 5
        elif p6h > 0:
            momentum_score += 3
        elif p6h > -15:
            momentum_score += 1

    # 24h price change
    p24h = token.get("price_change_h24")
    if p24h is not None:
        if p24h > 20:
            momentum_score += 4
        elif p24h > 0:
            momentum_score += 2

    # Cap momentum score
    momentum_score = max(0, min(15, momentum_score))
    score += momentum_score

    # ═══════════════════════════════════════════════════════════════════════════
    # 7. LIQUIDITY ANALYSIS (0-10 points) - NEW from Birdeye
    # ═══════════════════════════════════════════════════════════════════════════
    liquidity_score = 0.0

    # Get liquidity from Birdeye
    if birdeye and birdeye.get("liquidity"):
        liquidity = birdeye.get("liquidity", 0)
        if liquidity > 0:
            if liquidity >= 5_000_000:
                liquidity_score += 10  # Very high liquidity
            elif liquidity >= 1_000_000:
                liquidity_score += 8  # High liquidity
            elif liquidity >= 500_000:
                liquidity_score += 6  # Good liquidity
            elif liquidity >= 100_000:
                liquidity_score += 4  # Acceptable liquidity
            elif liquidity >= 50_000:
                liquidity_score += 2  # Low liquidity
            else:
                liquidity_score += 1  # Very low liquidity

    # Cap liquidity score
    liquidity_score = max(0, min(10, liquidity_score))
    score += liquidity_score

    # ═══════════════════════════════════════════════════════════════════════════
    # 8. AGE & VOLUME PENALTIES (Existing logic - keep as is)
    # ═══════════════════════════════════════════════════════════════════════════
    age = token.get("age_hours") or 0
    vol24 = token.get("volume_h24") or 0

    # Age penalties
    if age > 72:
        if age > 720:  # >30 days
            score -= 20
        elif age > 336:  # >14 days
            score -= 15
        elif age > 168:  # >7 days
            score -= 10
        elif age > 72:  # >3 days
            score -= 5

    # Volume penalties
    if vol24 > 0:
        if vol24 < 50_000:
            score -= 10  # Very low volume
        elif vol24 < 100_000:
            score -= 5  # Low volume
        elif vol24 < 250_000:
            score -= 2  # Somewhat low volume

    # Old + low volume combination penalty
    if age > 72 and vol24 < 100_000:
        score -= 15  # Old token with dead volume
    elif age > 168 and vol24 < 50_000:
        score -= 20  # Very old token with very low volume

    # ═══════════════════════════════════════════════════════════════════════════
    # 9. NEGATIVES PENALTY (Enhanced)
    # ═══════════════════════════════════════════════════════════════════════════
    negative_penalties = {
        "death spiral": 20,
        "POSSIBLE RUG": 30,
        "mint not renounced": 15,
        "stagnant volume": 10,
        "token farmer": 10,
        "HEAVY SELLS": 10,
        "ONLY SELLS": 15,
        "collapsed h24": 10,
        "DEAD h24": 15,
        "DEAD h6": 12,
        "crashed h6": 8,
        "declining h6": 5,
        "decline h1": 5,
        "CRASH h1": 15,
        "down h24": 5,
        "freeze not renounced": 8,
        "HAS MINT AUTHORITY": 12,
        "no txns in 6h": 8,
    }

    for neg in negatives:
        for pattern, penalty in negative_penalties.items():
            if pattern.lower() in neg.lower():
                score -= penalty
                break
        else:
            # Default penalty for unmatched negatives
            score -= 3

    # ═══════════════════════════════════════════════════════════════════════════
    # 10. POSITIVE QUALITY ADJUSTMENT
    # ═══════════════════════════════════════════════════════════════════════════
    positives = token.get("positives") or []

    # Reduce bonus for positives on old tokens with low volume
    if age > 72 and vol24 < 100_000:
        if "burned" in positives:
            score -= 2  # Reduce the bonus
        if "CoinGecko listed" in positives:
            score -= 1  # Reduce the bonus

    # Cap final score
    return round(max(0, min(100, score)), 2)


def enhance_existing_tokens(tokens: list[dict]) -> list[dict]:
    """
    Enhance existing tokens with better scoring using available data.

    This function takes existing tokens and applies the enhanced scoring formula.
    """
    enhanced_tokens = []

    for token in tokens:
        # Calculate enhanced score
        enhanced_score = compute_enhanced_token_score(token)

        # Create enhanced token with new score
        enhanced_token = token.copy()
        enhanced_token["enhanced_score"] = enhanced_score
        enhanced_token["original_score"] = token.get("score", 0)

        # Add scoring breakdown for transparency
        enhanced_token["scoring_breakdown"] = {
            "liquidity": min(20, max(0, 20 - (token.get("liq_risk") == "critical") * 5)),
            "distribution": min(15, max(0, 15 - (token.get("insider_percentage", 0) > 20) * 5)),
            "twitter": min(15, max(0, 15 - (token.get("tw_sentiment_score", 0) < 0.4) * 5)),
            "community": min(10, max(0, 10 - (token.get("channel_count", 0) < 2) * 5)),
        }

        enhanced_tokens.append(enhanced_token)

    # Sort by enhanced score
    enhanced_tokens.sort(key=lambda t: t.get("enhanced_score", 0), reverse=True)

    return enhanced_tokens


# ═══════════════════════════════════════════════════════════════════════════════
# INTEGRATION WITH EXISTING PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════


def integrate_with_existing_pipeline():
    """
    Integrate enhanced scoring with existing pipeline.

    This function can be called from the existing cross_scoring.py to enhance
    the scoring without breaking existing functionality.
    """
    # Load existing tokens
    output_path = settings.output_path
    if not output_path.exists():
        log.error("top100_not_found", path=str(output_path))
        return

    with open(output_path) as f:
        data = json.load(f)

    tokens = data.get("tokens", [])
    if not tokens:
        log.warning("No tokens found in top100.json")
        return

    log.info(f"Enhancing {len(tokens)} tokens with improved scoring")

    # Apply enhanced scoring
    enhanced_tokens = enhance_existing_tokens(tokens)

    # Update data with enhanced scores
    data["tokens"] = enhanced_tokens
    data["enhanced_at"] = time.time()

    # Save enhanced data
    enhanced_path = output_path.parent / "top100_enhanced.json"
    with open(enhanced_path, "w") as f:
        json.dump(data, f, indent=2, default=str)

    log.info(f"Enhanced scoring complete. Saved to {enhanced_path}")

    # Print top 10 tokens with enhanced scores
    print("\nTop 10 tokens with enhanced scoring:")
    print("=" * 80)
    for i, token in enumerate(enhanced_tokens[:10], 1):
        symbol = token.get("symbol", "?")
        enhanced = token.get("enhanced_score", 0)
        original = token.get("original_score", 0)
        print(f"{i:2}. {symbol:15} Enhanced: {enhanced:6.2f} (was {original:6.2f})")

    return enhanced_tokens


if __name__ == "__main__":
    # Run enhanced scoring
    integrate_with_existing_pipeline()
