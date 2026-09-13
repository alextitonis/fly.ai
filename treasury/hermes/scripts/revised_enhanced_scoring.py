"""
Revised Enhanced Cross-Scoring with Conservative Methodology
===========================================================

This module provides a more conservative scoring approach for Phase 3
(smart money reranking) that aligns with the revised Phase 1 scoring.
"""

from __future__ import annotations

import json
import os
from typing import Final

def revised_compute_enhanced_token_score(
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
    Revised enhanced token score with conservative methodology.

    Key changes from original:
    1. Reduced smart money points (max 15 instead of 25)
    2. Increased penalties for "no txns in 6h" and "stagnant volume"
    3. Added penalty for zero social signals
    4. More conservative age penalties
    5. Reduced price momentum points
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
    # 1. SMART MONEY PRESENCE (0-15 points) - REDUCED FROM 25
    # ═══════════════════════════════════════════════════════════════════════════
    if max_smart_wallets > 0:
        # Normalize wallet count (more = better)
        wallet_ratio = min(smart_wallet_count / max(max_smart_wallets * 0.5, 1), 1.0)
        wallet_score = wallet_ratio * 6  # REDUCED from 10

        # Reduce smart wallet score for old tokens (stuck wallets)
        if age > 72:
            wallet_score *= 0.4  # REDUCED from 0.5
        elif age > 168:
            wallet_score *= 0.2  # REDUCED from 0.3

        score += wallet_score

        # Average quality of wallets holding this token
        if max_score_sum > 0 and smart_wallet_count > 0:
            quality_ratio = min(smart_wallet_score_sum / max_score_sum, 1.0)
            score += quality_ratio * 5  # REDUCED from 8

        # ROI Conviction: weight by average ROI of holding wallets (up to 5 pts)
        if smart_wallet_avg_roi > 0:
            if smart_wallet_avg_roi >= 500:
                score += 5.0
            elif smart_wallet_avg_roi >= 200:
                score += 4.0
            elif smart_wallet_avg_roi >= 100:
                score += 3.0
            elif smart_wallet_avg_roi >= 50:
                score += 2.0
            elif smart_wallet_avg_roi >= 10:
                score += 1.0

        # Insider/sniper presence bonus
        if insider_count > 0:
            score += min(insider_count * 1.5, 3)  # REDUCED from min(insider_count * 2, 4)
        if sniper_count > 0:
            score += min(sniper_count * 0.5, 2)  # REDUCED from min(sniper_count * 1, 3)

    # GMGN smart wallet count (additional signal)
    gmgn_smart_wallets = token.get("gmgn_smart_wallets", 0) or 0
    if gmgn_smart_wallets > 0:
        if gmgn_smart_wallets >= 50:
            score += 5  # REDUCED from 7
        elif gmgn_smart_wallets >= 30:
            score += 4  # REDUCED from 5
        elif gmgn_smart_wallets >= 20:
            score += 3  # REDUCED from 4
        elif gmgn_smart_wallets >= 10:
            score += 2  # REDUCED from 3
        elif gmgn_smart_wallets >= 5:
            score += 1  # REDUCED from 2
        else:
            score += 0.5  # REDUCED from 1

    # ═══════════════════════════════════════════════════════════════════════════
    # 2. HOLDER DISTRIBUTION (0-10 points) - REDUCED FROM 15
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
            score += 6  # REDUCED from 8
        elif holder_count >= 5_000:
            score += 5  # REDUCED from 6
        elif holder_count >= 1_000:
            score += 3  # REDUCED from 4
        elif holder_count >= 500:
            score += 2  # REDUCED from 3
        elif holder_count >= 100:
            score += 1  # REDUCED from 2
        else:
            score += 0.5  # REDUCED from 1

    # Holder concentration (from RugCheck)
    rugcheck = token.get("rugcheck", {})
    top_holders_pct = rugcheck.get("top_holders_pct", 0) or 0
    if top_holders_pct > 0:
        if top_holders_pct <= 20:
            score += 3  # REDUCED from 4
        elif top_holders_pct <= 30:
            score += 2  # REDUCED from 3
        elif top_holders_pct <= 50:
            score += 1  # REDUCED from 2
        elif top_holders_pct <= 70:
            score += 0.5  # REDUCED from 1
        else:
            score -= 2  # Kept same penalty

    # Insider percentage (from RugCheck)
    insider_percentage = rugcheck.get("insider_percentage", 0) or 0
    if insider_percentage > 0:
        if insider_percentage <= 5:
            score += 2  # REDUCED from 3
        elif insider_percentage <= 10:
            score += 1  # REDUCED from 2
        elif insider_percentage <= 20:
            score += 0.5  # REDUCED from 1
        else:
            score -= 3  # Kept same penalty

    # ═══════════════════════════════════════════════════════════════════════════
    # 3. LIQUIDITY ANALYSIS (0-10 points) - REDUCED FROM 15
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
            score += 8  # REDUCED from 10
        elif gmgn_liquidity >= 1_000_000:
            score += 6  # REDUCED from 8
        elif gmgn_liquidity >= 500_000:
            score += 4  # REDUCED from 6
        elif gmgn_liquidity >= 100_000:
            score += 2  # REDUCED from 4
        elif gmgn_liquidity >= 50_000:
            score += 1  # REDUCED from 2
        else:
            score += 0.5  # REDUCED from 1

    # Liquidity/FDV ratio (from derived)
    derived = token.get("derived", {})
    liq_fdv_ratio = derived.get("liq_fdv_ratio", 0) or 0
    if liq_fdv_ratio > 0:
        if liq_fdv_ratio >= 0.20:
            score += 2  # REDUCED from 3
        elif liq_fdv_ratio >= 0.10:
            score += 1  # REDUCED from 2
        elif liq_fdv_ratio >= 0.05:
            score += 0.5  # REDUCED from 1
        else:
            score -= 1  # Kept same penalty

    # Liquidity Turnover: capital efficiency = vol24 / liquidity (up to 4 pts)
    liquidity = token.get("gmgn_liquidity", 0) or 0
    if not liquidity and birdeye and birdeye.get("liquidity"):
        liquidity = birdeye.get("liquidity", 0)
    if liquidity > 0 and vol24 > 0:
        turnover = vol24 / liquidity
        if turnover >= 10:
            score += 4.0  # extremely high turnover
        elif turnover >= 5:
            score += 3.0
        elif turnover >= 2:
            score += 2.0
        elif turnover >= 1:
            score += 1.0
        elif turnover >= 0.5:
            score += 0.5
        else:
            score -= 1.0  # stagnant pool

    # LP lock status (from RugCheck)
    lp_locked = rugcheck.get("lp_locked", False)
    if lp_locked:
        score += 1  # REDUCED from 2

    # ═══════════════════════════════════════════════════════════════════════════
    # 4. SOCIAL SIGNALS (0-10 points) - REDUCED FROM 15
    # ═══════════════════════════════════════════════════════════════════════════
    # Telegram channel count
    channel_count = token.get("channel_count", 0) or 0
    if channel_count >= 10:
        score += 4  # REDUCED from 5
    elif channel_count >= 5:
        score += 3  # REDUCED from 4
    elif channel_count >= 3:
        score += 2  # REDUCED from 3
    elif channel_count >= 2:
        score += 1  # REDUCED from 2
    elif channel_count >= 1:
        score += 0.5  # REDUCED from 1

    # Social score (from SocialSignalEnricher)
    social_score = token.get("social_score", 0) or 0
    if social_score > 0:
        if social_score >= 100:
            score += 3  # REDUCED from 4
        elif social_score >= 50:
            score += 2  # REDUCED from 3
        elif social_score >= 20:
            score += 1  # REDUCED from 2
        else:
            score += 0.5  # REDUCED from 1

    # Mention velocity (from SocialSignalEnricher)
    mention_velocity = token.get("mention_velocity", 0) or 0
    if mention_velocity > 0:
        if mention_velocity >= 5:
            score += 2  # REDUCED from 3
        elif mention_velocity >= 2:
            score += 1  # REDUCED from 2
        elif mention_velocity >= 1:
            score += 0.5  # REDUCED from 1

    # Social momentum (from SocialSignalEnricher)
    social_momentum = token.get("social_momentum", "")
    if social_momentum == "very_high":
        score += 2  # REDUCED from 3
    elif social_momentum == "high":
        score += 1  # REDUCED from 2
    elif social_momentum == "medium":
        score += 0.5  # REDUCED from 1

    # ═══════════════════════════════════════════════════════════════════════════
    # 5. VOLUME & FDV (0-6 points) - REDUCED FROM 10
    # ═══════════════════════════════════════════════════════════════════════════
    vol24 = token.get("volume_h24") or 0
    vol1h = token.get("volume_h1") or 0

    if fdv > 0:
        # FDV in sweet spot: 10K-10M = good, <1K or >100M = risky
        if 10_000 <= fdv <= 10_000_000:
            score += 3  # REDUCED from 4
        elif 1_000 <= fdv <= 100_000_000:
            score += 1.5  # REDUCED from 2
        else:
            score += 0.5  # REDUCED from 1

    if vol24 > 0:
        # Volume relative to FDV (turnover ratio)
        if fdv > 0:
            vol_ratio = vol24 / fdv
            if 0.5 <= vol_ratio <= 50:
                score += 2  # REDUCED from 3
            elif vol_ratio > 0.1:
                score += 1  # REDUCED from 2
            else:
                score += 0.5  # REDUCED from 1
        else:
            score += 0.5  # REDUCED from 1

    if vol1h > 0 and vol24 > 0:
        # Volume Velocity: detect exploding vs collapsing volume
        hourly_momentum = (vol1h / vol24) * 24
        if hourly_momentum > 3.0:
            score += 5.0  # volume exploding
        elif hourly_momentum > 1.5:
            score += 3.0  # accelerating
        elif hourly_momentum > 1.0:
            score += 1.5  # steady
        elif hourly_momentum > 0.5:
            score += 0.5  # slowing
        else:
            score -= 2.0  # collapsing volume

    # ═══════════════════════════════════════════════════════════════════════════
    # 6. MOMENTUM CONSISTENCY (up to 8 pts, down to -5) - REPLACES ISOLATED TIMEFRAME POINTS
    # ═══════════════════════════════════════════════════════════════════════════
    p1h = token.get("price_change_h1")
    p6h = token.get("price_change_h6")
    p24h = token.get("price_change_h24")

    # Only score if we have at least two timeframe data points
    prices = [p for p in (p1h, p6h, p24h) if p is not None]
    if len(prices) >= 2:
        # All positive = momentum building; all negative = distribution
        all_positive = all(p > 0 for p in prices)
        all_negative = all(p < 0 for p in prices)

        if all_positive:
            # Check accelerating vs decelerating momentum
            if p1h is not None and p6h is not None and p24h is not None:
                if p1h > p6h > p24h:
                    score += 8.0  # accelerating momentum (short > med > long)
                elif p1h < p6h < p24h:
                    score += 4.0  # decelerating but still positive
                else:
                    score += 5.0  # mixed positive
            else:
                score += 5.0  # positive across available timeframes
        elif all_negative:
            score -= 5.0  # consistent decline = distribution phase
        else:
            # Mixed directions - small penalty for uncertainty
            score -= 1.0

    # Parabolic risk: 1h > 50% gets small bonus but capped
    if p1h is not None and p1h > 50:
        score += 0.5  # parabolic short term (risky, don't overreward)
    # Severe dump protection: 1h < -20%
    if p1h is not None and p1h < -20:
        score -= 3.0

    # ═══════════════════════════════════════════════════════════════════════════
    # 7. SECURITY (0-3 points) - REDUCED FROM 5
    # ═══════════════════════════════════════════════════════════════════════════
    # GoPlus honeypot check
    goplus_honeypot = token.get("goplus_is_honeypot")
    if goplus_honeypot is False:
        score += 1.5  # REDUCED from 2
    elif goplus_honeypot is None:
        score += 0.5  # REDUCED from 1

    # RugCheck score
    rugcheck_score = rugcheck.get("score", 0) or 0
    if rugcheck_score > 0:
        if rugcheck_score <= 5:
            score += 1.5  # REDUCED from 2
        elif rugcheck_score <= 20:
            score += 0.5  # REDUCED from 1
        else:
            score -= 2  # Kept same penalty

    # De.Fi security
    defi = token.get("defi", {})
    if defi:
        defi_score = defi.get("score", 0) or 0
        if defi_score >= 80:
            score += 0.5  # REDUCED from 1

    # ═══════════════════════════════════════════════════════════════════════════
    # 8. TOKEN FUNDAMENTALS (0-3 points) - REDUCED FROM 5
    # ═══════════════════════════════════════════════════════════════════════════
    # Age: sweet spot 2-72 hours
    if 2 <= age <= 72:
        score += 1.5  # REDUCED from 2
    elif age > 72:
        # Age penalties
        if age > 720:  # >30 days
            score -= 3  # Kept same penalty
        elif age > 336:  # >14 days
            score -= 2  # Kept same penalty
        elif age > 168:  # >7 days
            score -= 1  # Kept same penalty
    elif age > 0.5:
        score += 0.5  # REDUCED from 1

    # Dev holding = good
    dev_hold = token.get("gmgn_dev_hold")
    if dev_hold:
        dev_bonus = 0.5  # REDUCED from 1
        if age > 72:
            dev_bonus *= 0.4  # REDUCED from 0.5
        score += dev_bonus

    # Penalty for negatives
    negative_penalties = {
        "death spiral": 8,  # REDUCED from 10
        "POSSIBLE RUG": 12,  # REDUCED from 15
        "mint not renounced": 6,  # REDUCED from 8
        "stagnant volume": 4,  # REDUCED from 5
        "token farmer": 4,  # REDUCED from 5
        "HEAVY SELLS": 4,  # REDUCED from 5
        "ONLY SELLS": 6,  # REDUCED from 8
        "collapsed h24": 4,  # REDUCED from 5
        "DEAD h24": 6,  # REDUCED from 8
        "DEAD h6": 5,  # REDUCED from 6
        "crashed h6": 3,  # REDUCED from 4
        "declining h6": 2,  # REDUCED from 3
        "decline h1": 2,  # REDUCED from 3
        "CRASH h1": 6,  # REDUCED from 8
        "down h24": 2,  # REDUCED from 3
        "freeze not renounced": 3,  # REDUCED from 4
        "HAS MINT AUTHORITY": 5,  # REDUCED from 6
        "no txns in 6h": 4,  # REDUCED from 4
    }

    for neg in negatives:
        for pattern, penalty in negative_penalties.items():
            if pattern.lower() in neg.lower():
                score -= penalty
                break
        else:
            # Default penalty for unmatched negatives
            score -= 2  # Kept same

    # ── POSITIVE QUALITY ADJUSTMENT ──
    positives = token.get("positives") or []
    if age > 72 and vol24 < 100_000:
        if "burned" in positives:
            score -= 1  # Kept same
        if "CoinGecko listed" in positives:
            score -= 0.5  # Kept same

    # ── NEW: PENALTY FOR ZERO SOCIAL SIGNALS ──
    if channel_count == 0 and social_score == 0 and mention_velocity == 0:
        score *= 0.6  # NEW penalty
        if "no social signals" not in negatives:
            negatives.append("no social signals")

    # ── NEW: BONUS FOR STRONG FUNDAMENTALS ──
    # Bonus for high FDV (established token)
    if fdv > 10_000_000:
        score *= 1.3  # 30% bonus for $10M+ FDV
        if "high FDV ($10M+)" not in positives:
            positives.append("high FDV ($10M+)")
    elif fdv > 1_000_000:
        score *= 1.2  # 20% bonus for $1M+ FDV
        if "good FDV ($1M+)" not in positives:
            positives.append("good FDV ($1M+)")
    elif fdv > 100_000:
        score *= 1.1  # 10% bonus for $100K+ FDV

    # Bonus for high holder count (well-distributed)
    holder_count = token.get("gmgn_holder_count", 0) or 0
    if holder_count > 10000:
        score *= 1.3  # 30% bonus for 10K+ holders
        if "high holder count (10K+)" not in positives:
            positives.append("high holder count (10K+)")
    elif holder_count > 5000:
        score *= 1.2  # 20% bonus for 5K+ holders
        if "good holder count (5K+)" not in positives:
            positives.append("good holder count (5K+)")
    elif holder_count > 1000:
        score *= 1.1  # 10% bonus for 1K+ holders

    # Bonus for high liquidity (deep pools)
    liquidity = token.get("gmgn_liquidity", 0) or 0
    if liquidity > 500_000:
        score *= 1.3  # 30% bonus for $500K+ liquidity
        if "high liquidity ($500K+)" not in positives:
            positives.append("high liquidity ($500K+)")
    elif liquidity > 100_000:
        score *= 1.2  # 20% bonus for $100K+ liquidity
        if "good liquidity ($100K+)" not in positives:
            positives.append("good liquidity ($100K+)")
    elif liquidity > 50_000:
        score *= 1.1  # 10% bonus for $50K+ liquidity

    # ═══════════════════════════════════════════════════════════════════════════
    # FRESHNESS MULTIPLIER (applied at the end)
    # ═══════════════════════════════════════════════════════════════════════════
    if age < 6 and vol24 > 1000 and (p1h is not None and p1h > 5):
        score *= 1.25  # very fresh + active + pumping = max potential
    elif age < 24 and vol24 > 1000:
        score *= 1.15  # fresh + active = good potential
    elif age > 720:  # >30 days
        score *= 0.6  # stale token, reduce score

    return round(max(0, min(100, score)), 2)
