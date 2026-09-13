"""
Enhanced Cross-Scoring with Full Enriched Data Utilization
==========================================================

This module enhances the token scoring to fully utilize all enriched data:
- Holder distribution from Helius/Birdeye
- Liquidity data from Birdeye
- Social signals from SocialSignalEnricher
- Insider analysis from RugCheck
- Smart money from GMGN
- Security from RugCheck/De.Fi
"""

from __future__ import annotations

from hermes_screener.logging import get_logger

log = get_logger("enhanced_cross_scoring")

# ═══════════════════════════════════════════════════════════════════════════════
# ENHANCED SCORING WITH FULL DATA UTILIZATION
# ═══════════════════════════════════════════════════════════════════════════════


def compute_enhanced_token_score(
    token: dict,
    smart_wallet_count: int,
    smart_wallet_score_sum: float,
    smart_wallet_avg_roi: float,
    smart_wallet_total_profit: float,
    insider_count: int,
    sniper_count: int,
    max_smart_wallets: int,
    max_score_sum: float,
) -> float:
    """
    Compute enhanced token score using ALL available enriched data.

    Weights (sum = 100):
      Smart Money Presence   25  (GMGN smart wallets + cross-scoring)
      Holder Distribution    15  (Helius/Birdeye holder counts + RugCheck concentration)
      Liquidity Analysis     15  (Birdeye liquidity + FDV ratio + LP lock)
      Social Signals         15  (Telegram + Twitter + velocity + momentum)
      Volume & FDV           10  (Dexscreener volume, FDV, turnover)
      Price Momentum         10  (price_change_h1, h6, h24)
      Security               5   (RugCheck/De.Fi security scores)
      Token Fundamentals     5   (age, dev_hold, negatives)
    """
    # ── HARD EXCLUSIONS (return 0 immediately) ──
    negatives = token.get("negatives") or []
    age = token.get("age_hours") or 0
    vol24 = token.get("volume_h24") or 0

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
    # 1. SMART MONEY PRESENCE (0-25 points)
    # ═══════════════════════════════════════════════════════════════════════════
    if max_smart_wallets > 0:
        # Normalize wallet count (more = better)
        wallet_ratio = min(smart_wallet_count / max(max_smart_wallets * 0.5, 1), 1.0)
        wallet_score = wallet_ratio * 10

        # Reduce smart wallet score for old tokens (stuck wallets)
        if age > 72:
            wallet_score *= 0.5
        elif age > 168:
            wallet_score *= 0.3

        score += wallet_score

        # Average quality of wallets holding this token
        if max_score_sum > 0 and smart_wallet_count > 0:
            quality_ratio = min(smart_wallet_score_sum / max_score_sum, 1.0)
            score += quality_ratio * 8

        # Insider/sniper presence bonus
        if insider_count > 0:
            score += min(insider_count * 2, 4)
        if sniper_count > 0:
            score += min(sniper_count * 1, 3)

    # GMGN smart wallet count (additional signal)
    gmgn_smart_wallets = token.get("gmgn_smart_wallets", 0) or 0
    if gmgn_smart_wallets > 0:
        if gmgn_smart_wallets >= 50:
            score += 7
        elif gmgn_smart_wallets >= 30:
            score += 5
        elif gmgn_smart_wallets >= 20:
            score += 4
        elif gmgn_smart_wallets >= 10:
            score += 3
        elif gmgn_smart_wallets >= 5:
            score += 2
        else:
            score += 1

    # ═══════════════════════════════════════════════════════════════════════════
    # 2. HOLDER DISTRIBUTION (0-15 points) - NEW from Helius/Birdeye
    # ═══════════════════════════════════════════════════════════════════════════
    holder_count = 0

    # Get holder count from GMGN (most reliable)
    gmgn_holder_count = token.get("gmgn_holder_count", 0) or 0
    if gmgn_holder_count > 0:
        holder_count = gmgn_holder_count

    # Fallback to Helius
    helius = token.get("helius", {})
    if not holder_count and helius and helius.get("holder_count"):
        holder_count = helius.get("holder_count", 0)

    # Fallback to Birdeye
    birdeye = token.get("birdeye", {})
    if not holder_count and birdeye and birdeye.get("holder_count"):
        holder_count = birdeye.get("holder_count", 0)

    # Score based on holder count
    if holder_count > 0:
        if holder_count >= 10_000:
            score += 8  # Very distributed
        elif holder_count >= 5_000:
            score += 6  # Well distributed
        elif holder_count >= 1_000:
            score += 4  # Moderately distributed
        elif holder_count >= 500:
            score += 3  # Somewhat concentrated
        elif holder_count >= 100:
            score += 2  # Concentrated
        else:
            score += 1  # Very concentrated

    # Holder concentration (from RugCheck)
    rugcheck = token.get("rugcheck", {})
    top_holders_pct = rugcheck.get("top_holders_pct", 0) or 0
    if top_holders_pct > 0:
        if top_holders_pct <= 20:
            score += 4  # Very distributed
        elif top_holders_pct <= 30:
            score += 3  # Well distributed
        elif top_holders_pct <= 50:
            score += 2  # Moderately concentrated
        elif top_holders_pct <= 70:
            score += 1  # Concentrated
        else:
            score -= 2  # Highly concentrated

    # Insider percentage (from RugCheck)
    insider_percentage = rugcheck.get("insider_percentage", 0) or 0
    if insider_percentage > 0:
        if insider_percentage <= 5:
            score += 3  # Very low insider ownership
        elif insider_percentage <= 10:
            score += 2  # Low insider ownership
        elif insider_percentage <= 20:
            score += 1  # Moderate insider ownership
        else:
            score -= 3  # High insider ownership

    # ═══════════════════════════════════════════════════════════════════════════
    # 3. LIQUIDITY ANALYSIS (0-15 points) - NEW from Birdeye
    # ═══════════════════════════════════════════════════════════════════════════
    # Get liquidity from GMGN (most reliable)
    gmgn_liquidity = token.get("gmgn_liquidity", 0) or 0

    # Fallback to Birdeye
    if not gmgn_liquidity and birdeye and birdeye.get("liquidity"):
        gmgn_liquidity = birdeye.get("liquidity", 0)

    # Get FDV for ratio calculation
    fdv = token.get("fdv") or 0

    # Score based on liquidity
    if gmgn_liquidity > 0:
        if gmgn_liquidity >= 5_000_000:
            score += 10  # Very high liquidity
        elif gmgn_liquidity >= 1_000_000:
            score += 8  # High liquidity
        elif gmgn_liquidity >= 500_000:
            score += 6  # Good liquidity
        elif gmgn_liquidity >= 100_000:
            score += 4  # Acceptable liquidity
        elif gmgn_liquidity >= 50_000:
            score += 2  # Low liquidity
        else:
            score += 1  # Very low liquidity

    # Liquidity/FDV ratio (from derived)
    derived = token.get("derived", {})
    liq_fdv_ratio = derived.get("liq_fdv_ratio", 0) or 0
    if liq_fdv_ratio > 0:
        if liq_fdv_ratio >= 0.20:
            score += 3  # Very healthy
        elif liq_fdv_ratio >= 0.10:
            score += 2  # Healthy
        elif liq_fdv_ratio >= 0.05:
            score += 1  # Moderate
        else:
            score -= 1  # Low

    # LP lock status (from RugCheck)
    lp_locked = rugcheck.get("lp_locked", False)
    if lp_locked:
        score += 2  # LP locked = good

    # ═══════════════════════════════════════════════════════════════════════════
    # 4. SOCIAL SIGNALS (0-15 points) - NEW from SocialSignalEnricher
    # ═══════════════════════════════════════════════════════════════════════════
    # Telegram channel count
    channel_count = token.get("channel_count", 0) or 0
    if channel_count >= 10:
        score += 5
    elif channel_count >= 5:
        score += 4
    elif channel_count >= 3:
        score += 3
    elif channel_count >= 2:
        score += 2
    elif channel_count >= 1:
        score += 1

    # Social score (from SocialSignalEnricher)
    social_score = token.get("social_score", 0) or 0
    if social_score > 0:
        if social_score >= 100:
            score += 4  # Very high social activity
        elif social_score >= 50:
            score += 3  # High social activity
        elif social_score >= 20:
            score += 2  # Moderate social activity
        else:
            score += 1  # Low social activity

    # Mention velocity (from SocialSignalEnricher)
    mention_velocity = token.get("mention_velocity", 0) or 0
    if mention_velocity > 0:
        if mention_velocity >= 5:
            score += 3  # Very high velocity
        elif mention_velocity >= 2:
            score += 2  # High velocity
        elif mention_velocity >= 1:
            score += 1  # Moderate velocity

    # Social momentum (from SocialSignalEnricher)
    social_momentum = token.get("social_momentum", "")
    if social_momentum == "very_high":
        score += 3
    elif social_momentum == "high":
        score += 2
    elif social_momentum == "medium":
        score += 1

    # ═══════════════════════════════════════════════════════════════════════════
    # 5. VOLUME & FDV (0-10 points)
    # ═══════════════════════════════════════════════════════════════════════════
    vol24 = token.get("volume_h24") or 0
    vol1h = token.get("volume_h1") or 0

    if fdv > 0:
        # FDV in sweet spot: 10K-10M = good, <1K or >100M = risky
        if 10_000 <= fdv <= 10_000_000:
            score += 4
        elif 1_000 <= fdv <= 100_000_000:
            score += 2
        else:
            score += 1

    if vol24 > 0:
        # Volume relative to FDV (turnover ratio)
        if fdv > 0:
            vol_ratio = vol24 / fdv
            if 0.5 <= vol_ratio <= 50:
                score += 3  # healthy turnover
            elif vol_ratio > 0.1:
                score += 2
            else:
                score += 1
        else:
            score += 1

    if vol1h > 0 and vol24 > 0:
        # Recent momentum: 1h volume / 24h volume * 24
        hourly_momentum = (vol1h / vol24) * 24
        if hourly_momentum > 1.5:
            score += 3  # accelerating
        elif hourly_momentum > 1.0:
            score += 2
        else:
            score += 1

    # ═══════════════════════════════════════════════════════════════════════════
    # 6. PRICE MOMENTUM (0-10 points)
    # ═══════════════════════════════════════════════════════════════════════════
    p1h = token.get("price_change_h1")
    p6h = token.get("price_change_h6")
    p24h = token.get("price_change_h24")

    if p1h is not None:
        if 5 <= p1h <= 50:
            score += 4  # strong but not parabolic
        elif 0 < p1h < 5:
            score += 3  # steady
        elif -10 < p1h <= 0:
            score += 2  # slight dip
        elif p1h > 50:
            score += 1  # parabolic (risky)
        else:
            score += 0  # dumping

    if p6h is not None:
        if p6h > 10:
            score += 3
        elif p6h > 0:
            score += 2
        elif p6h > -15:
            score += 1

    if p24h is not None:
        if p24h > 20:
            score += 3
        elif p24h > 0:
            score += 2

    # ═══════════════════════════════════════════════════════════════════════════
    # 7. SECURITY (0-5 points)
    # ═══════════════════════════════════════════════════════════════════════════
    # GoPlus honeypot check
    goplus_honeypot = token.get("goplus_is_honeypot")
    if goplus_honeypot is False:
        score += 2
    elif goplus_honeypot is None:
        score += 1

    # RugCheck score
    rugcheck_score = rugcheck.get("score", 0) or 0
    if rugcheck_score > 0:
        if rugcheck_score <= 5:
            score += 2  # Low risk
        elif rugcheck_score <= 20:
            score += 1  # Moderate risk
        else:
            score -= 2  # High risk

    # De.Fi security
    defi = token.get("defi", {})
    if defi:
        defi_score = defi.get("score", 0) or 0
        if defi_score >= 80:
            score += 1  # Good security

    # ═══════════════════════════════════════════════════════════════════════════
    # 8. TOKEN FUNDAMENTALS (0-5 points)
    # ═══════════════════════════════════════════════════════════════════════════
    # Age: sweet spot 2-72 hours
    if 2 <= age <= 72:
        score += 2
    elif age > 72:
        # Age penalties
        if age > 720:  # >30 days
            score -= 3
        elif age > 336:  # >14 days
            score -= 2
        elif age > 168:  # >7 days
            score -= 1
    elif age > 0.5:
        score += 1

    # Dev holding = good
    dev_hold = token.get("gmgn_dev_hold")
    if dev_hold:
        dev_bonus = 1
        if age > 72:
            dev_bonus *= 0.5
        score += dev_bonus

    # Penalty for negatives
    negative_penalties = {
        "death spiral": 10,
        "POSSIBLE RUG": 15,
        "mint not renounced": 8,
        "stagnant volume": 5,
        "token farmer": 5,
        "HEAVY SELLS": 5,
        "ONLY SELLS": 8,
        "collapsed h24": 5,
        "DEAD h24": 8,
        "DEAD h6": 6,
        "crashed h6": 4,
        "declining h6": 3,
        "decline h1": 3,
        "CRASH h1": 8,
        "down h24": 3,
        "freeze not renounced": 4,
        "HAS MINT AUTHORITY": 6,
        "no txns in 6h": 4,
    }

    for neg in negatives:
        for pattern, penalty in negative_penalties.items():
            if pattern.lower() in neg.lower():
                score -= penalty
                break
        else:
            # Default penalty for unmatched negatives
            score -= 2

    # ── POSITIVE QUALITY ADJUSTMENT ──
    positives = token.get("positives") or []
    if age > 72 and vol24 < 100_000:
        if "burned" in positives:
            score -= 1
        if "CoinGecko listed" in positives:
            score -= 0.5

    return round(max(0, min(100, score)), 2)
