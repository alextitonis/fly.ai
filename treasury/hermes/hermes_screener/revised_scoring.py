"""
Revised Token Scoring Methodology
==================================

This module implements a more conservative scoring approach that:
1. Reduces FDV/volume ratio points (was too generous)
2. Increases penalties for "no txns in 6h" and "stagnant volume"
3. Adds stricter criteria for fresh tokens
4. Makes price momentum scoring more conservative
5. Adds penalties for tokens with no social presence
6. Adds Market Existence Gate — ghost tokens with no liquidity/volume/txns score 0
7. Makes social signals liquidity-conditional — hype without pools is discounted

Key Changes:
- FDV/volume ratio: max 15 points (was 25)
- "no txns in 6h": 0.2x multiplier (was 0.4x)
- "stagnant volume": 0.3x multiplier (was 0.5x)
- Fresh tokens (<2h): no automatic bonus, must earn points
- Price momentum: max 5 points for positive changes (was 10+)
- Added penalty for zero social signals
- Ghost token gate: 0 score if no active DEX pairs, liquidity, or volume
- Social-liquidity conditionality: social signals scaled by liquidity depth
  * $100K+ liq = 100% social weight
  * $50K-$100K = 85%
  * $20K-$50K = 70%
  * $10K-$20K = 50%
  * $5K-$10K = 30%
  * $1K-$5K = 15%
  * <$1K = 5%
"""

from __future__ import annotations

import json
import logging
import os

# Use standard logging instead of hermes_screener.logging to avoid circular import
log = logging.getLogger("revised_scoring")

# ── Load priority token addresses from tokens×wallets page ──
# These tokens should receive a scoring boost per user instruction (Apr 22, 2026).
_PRIORITY_PATH = os.path.expanduser("~/.hermes/data/token_screener/priority_tokens.json")
_PRIORITY_TOKENS: set[tuple[str, str]] = set()  # {(chain, addr), …}


def _load_priority_tokens() -> None:
    global _PRIORITY_TOKENS
    try:
        if os.path.exists(_PRIORITY_PATH):
            with open(_PRIORITY_PATH) as f:
                data = json.load(f)
            for item in data:
                chain = (item.get("chain") or "").lower()
                addr = (item.get("contract_address") or "").lower()
                if chain and addr:
                    _PRIORITY_TOKENS.add((chain, addr))
            log.info("priority_tokens_loaded", extra={"count": len(_PRIORITY_TOKENS), "path": _PRIORITY_PATH})
    except Exception as e:
        log.warning("priority_tokens_load_failed", extra={"error": str(e)})


_load_priority_tokens()


def revised_score_token(token: dict) -> tuple[float, list[str], list[str]]:
    """
    Revised token scoring with more conservative methodology.

    Returns: (score, positives, negatives)
    """
    dex = token.get("dex", {})
    score = 0.0
    positives = []
    negatives = []

    # ── SYMBOL BLOCKLIST: fiat/stablecoins are not tradeable tokens ──
    BLOCKED_SYMBOLS = {
        "usd",
        "usdt",
        "usdc",
        "dai",
        "busd",
        "tusd",
        "eur",
        "gbp",
        "jpy",
        "cny",
        "btc",
        "eth",
        "sol",
        "bnb",
        "xrp",
        "wsol",
        "weth",
        "wbtc",
        "steth",
        "cbeth",
        "sui",
        "matic",
    }
    symbol = (dex.get("symbol") or token.get("symbol") or "").lower().strip()
    if symbol in BLOCKED_SYMBOLS:
        return 0, [], [f"BLOCKED: {symbol.upper()} is not a tradeable token"]

    # ── MARKET EXISTENCE GATE ──
    # A token must have verifiable on-chain liquidity or volume to be tradeable.
    # Tokens with no DexScreener pairs (delisted, pre-launch, fake) are "ghost tokens"
    # and cannot be evaluated regardless of social signals.
    liq_usd = dex.get("liquidity_usd") or 0
    vol_h24 = dex.get("volume_h24", 0) or 0
    txns_h1 = (dex.get("txns_h1", {}) or {}).get("buys", 0) or 0
    txns_h1_sells = (dex.get("txns_h1", {}) or {}).get("sells", 0) or 0
    fdv = dex.get("fdv") or dex.get("market_cap") or 0

    has_liquidity = liq_usd > 0
    has_volume = vol_h24 > 0
    has_txns = (txns_h1 + txns_h1_sells) > 0
    has_fdv = fdv > 0
    age_hours = dex.get("age_hours")

    # Early-token protection: brand-new launches (<1h) may not have registered
    # trades on DexScreener yet. Skip txns requirement for them.
    is_very_early = age_hours is not None and age_hours < 1

    if not has_liquidity and not has_volume and not (has_txns or is_very_early):
        # Completely unlisted / delisted / ghost token
        return 0.0, [], ["GHOST TOKEN: no active DEX pairs, liquidity, or volume"]

    if not has_liquidity and not has_fdv and not is_very_early:
        # Token has some volume but no liquidity and no market cap — likely
        # wash-traded or manipulated. Cap the base score before social bonuses.
        score -= 25
        negatives.append("no liquidity or market cap")

    # ── DISQUALIFIERS (return 0 immediately) ──
    if token.get("gmgn_honeypot"):
        return 0, [], ["HONEYPOT"]
    if token.get("goplus_is_honeypot"):
        return 0, [], ["HONEYPOT"]
    if token.get("rugcheck_rugged"):
        return 0, [], ["RUGGED"]
    if token.get("defi_scammed"):
        return 0, [], ["SCAMMED"]
    if token.get("derived_possible_rug"):
        return 0, [], ["POSSIBLE RUG"]
    if token.get("derived_massive_dump"):
        return 0, [], ["MASSIVE DUMP"]

    pc_h1 = dex.get("price_change_h1")
    pc_h6 = dex.get("price_change_h6")
    pc_h24 = dex.get("price_change_h24")
    vol_h1 = dex.get("volume_h1", 0) or 0
    age_hours = dex.get("age_hours")
    channel_count = token.get("channel_count", 0)
    mentions = token.get("mentions", 0)
    smart = token.get("gmgn_smart_wallets", 0)

    # ── SOCIAL-LIQUIDITY CONDITIONALITY ──
    # Social signals without liquidity backing are often manufactured
    # (bot mentions, fake channels, shill armies). Scale social points
    # by the depth of the on-chain market they purport to represent.
    liq = dex.get("liquidity_usd") or 0
    if liq >= 100_000:
        social_multiplier = 1.0
    elif liq >= 50_000:
        social_multiplier = 0.85
    elif liq >= 20_000:
        social_multiplier = 0.7
    elif liq >= 10_000:
        social_multiplier = 0.5
    elif liq >= 5_000:
        social_multiplier = 0.3
    elif liq >= 1_000:
        social_multiplier = 0.15
    else:
        social_multiplier = 0.05
    social_points = 0.0

    # ── 1. FDV/VOLUME RATIO (0-15 points) - REDUCED FROM 25 ──
    # Conservative scoring for turnover
    if vol_h24 <= 0:
        # Dead token - no trading activity
        score -= 30  # Increased penalty
        negatives.append("no volume")
        # NO bonus for fresh tokens with no volume
    elif fdv > 0:
        vol_fdv_ratio = vol_h24 / fdv
        if vol_fdv_ratio > 2:
            fdv_vol_score = 15  # REDUCED from 25
        elif vol_fdv_ratio > 1:
            fdv_vol_score = 12  # REDUCED from 22
        elif vol_fdv_ratio > 0.5:
            fdv_vol_score = 9  # REDUCED from 18
        elif vol_fdv_ratio > 0.2:
            fdv_vol_score = 6  # REDUCED from 14
        elif vol_fdv_ratio > 0.05:
            fdv_vol_score = 3  # REDUCED from 10
        else:
            fdv_vol_score = 1  # REDUCED from 5
        score += fdv_vol_score
    elif fdv > 0:
        # FDV but no volume data - very minor points only
        if fdv < 50_000:
            score += 2  # REDUCED from 5
        elif fdv < 200_000:
            score += 1  # REDUCED from 3
        else:
            score += 0.5  # REDUCED from 1

    # ── STALE DATA PENALTY: no price changes = dead ──
    if pc_h1 is None and pc_h6 is None and pc_h24 is None:
        score *= 0.2  # REDUCED from 0.3
        negatives.append("stale data")

    # ── 2. CHANNELS + MENTIONS (0-15 points) - REDUCED FROM 20 ──
    # More conservative social scoring
    if channel_count >= 10:
        social_points += 8  # REDUCED from 12
    elif channel_count >= 5:
        social_points += 6  # REDUCED from 9
    elif channel_count >= 3:
        social_points += 4  # REDUCED from 6
    elif channel_count >= 2:
        social_points += 2  # REDUCED from 3

    if mentions >= 10:
        social_points += 7  # REDUCED from 8
    elif mentions >= 5:
        social_points += 5  # REDUCED from 6
    elif mentions >= 3:
        social_points += 3  # REDUCED from 4
    elif mentions >= 1:
        social_points += 1  # REDUCED from 2

    # ── 3. SMART WALLETS (0-12 points) - REDUCED FROM 15 ──
    if smart >= 50:
        social_points += 12  # REDUCED from 15
    elif smart >= 30:
        social_points += 9  # REDUCED from 12
    elif smart >= 20:
        social_points += 7  # REDUCED from 10
    elif smart >= 10:
        social_points += 5  # REDUCED from 7
    elif smart >= 5:
        social_points += 3  # REDUCED from 4
    elif smart >= 1:
        social_points += 1  # REDUCED from 2

    # ── 4. DEV HOLDING (0-8 points) - REDUCED FROM 10 ──
    if token.get("gmgn_dev_hold"):
        social_points += 8  # REDUCED from 10
    dev_rate = token.get("gmgn_dev_team_hold_rate")
    if dev_rate is not None and dev_rate > 0.05:
        social_points += 2  # REDUCED from 3

    # ── 5. SOCIAL SIGNALS (0-8 points) - REDUCED FROM 10 ──
    tw_sent = token.get("tw_sentiment_score", 0) or 0
    social = token.get("social_score", 0) or 0
    if tw_sent > 70:
        social_points += 4  # REDUCED from 5
    elif tw_sent > 50:
        social_points += 2  # REDUCED from 3
    if social > 20:
        social_points += 4  # REDUCED from 5
    elif social > 10:
        social_points += 2  # REDUCED from 3
    elif social > 5:
        social_points += 1

    # Apply liquidity-conditional discount to all social signals
    if social_points > 0:
        if social_multiplier < 1.0:
            negatives.append(f"social signals discounted {social_multiplier:.0%} (liq ${liq:,.0f})")
        score += round(social_points * social_multiplier, 2)

    # ── 6. PRICE MOMENTUM (0-5 points) - REDUCED FROM 10 ──
    # Much more conservative momentum scoring
    if pc_h1 is not None:
        if pc_h1 > 10:  # Only give points for >10% gains
            score += 2  # REDUCED from 3
        elif pc_h1 > 0:
            score += 1  # REDUCED from 3
    if pc_h6 is not None:
        if pc_h6 > 20:  # Only give points for >20% gains
            score += 2  # REDUCED from 3
        elif pc_h6 > 0:
            score += 1  # REDUCED from 3
    if pc_h24 is not None:
        if pc_h24 > 30:  # Only give points for >30% gains
            score += 1  # REDUCED from 2
        elif pc_h24 > 0:
            score += 0.5  # REDUCED from 2
    # Remove bonus for all-positive (was +2)

    # ── 7. AGE PENALTY (older = harder to move) ──
    if age_hours is not None:
        if age_hours > 720:  # >30 days
            score *= 0.4  # REDUCED from 0.5
        elif age_hours > 168:  # >7 days
            score *= 0.6  # REDUCED from 0.7
        elif age_hours > 72:  # >3 days
            score *= 0.75  # REDUCED from 0.85
        # Note: Fresh tokens are desirable for pump potential - no penalty

    # ── STEEP DECLINE PENALTIES (>20% loss on any timeframe) ──
    if pc_h1 is not None:
        if pc_h1 < -60:
            score *= 0.05  # REDUCED from 0.1
            negatives.append(f"CRASH h1 ({pc_h1:+.0f}%)")
        elif pc_h1 < -40:
            score *= 0.15  # REDUCED from 0.2
            negatives.append(f"steep decline h1 ({pc_h1:+.0f}%)")
        elif pc_h1 < -20:
            score *= 0.4  # REDUCED from 0.5
            negatives.append(f"decline h1 ({pc_h1:+.0f}%)")

    if pc_h6 is not None:
        if pc_h6 < -70:
            score *= 0.05  # REDUCED from 0.1
            negatives.append(f"DEAD h6 ({pc_h6:+.0f}%)")
        elif pc_h6 < -50:
            score *= 0.15  # REDUCED from 0.2
            negatives.append(f"crashed h6 ({pc_h6:+.0f}%)")
        elif pc_h6 < -20:
            score *= 0.4  # REDUCED from 0.5
            negatives.append(f"declining h6 ({pc_h6:+.0f}%)")

    if pc_h24 is not None:
        if pc_h24 < -80:
            score *= 0.05  # REDUCED from 0.1
            negatives.append(f"DEAD h24 ({pc_h24:+.0f}%)")
        elif pc_h24 < -50:
            score *= 0.25  # REDUCED from 0.3
            negatives.append(f"collapsed h24 ({pc_h24:+.0f}%)")
        elif pc_h24 < -20:
            score *= 0.5  # REDUCED from 0.6
            negatives.append(f"down h24 ({pc_h24:+.0f}%)")

    # Death spiral
    if vol_h24 > 0 and vol_h1 < vol_h24 * 0.005 and pc_h6 is not None and pc_h6 < -10:
        score *= 0.2  # REDUCED from 0.3
        negatives.append("death spiral")

    # ── MULTIPLIERS (positive only) ──
    if token.get("etherscan_verified"):
        score *= 1.10  # REDUCED from 1.15

    if token.get("gmgn_renounced_mint") is True:
        score *= 1.05  # REDUCED from 1.10
    elif token.get("gmgn_renounced_mint") is False:
        score *= 0.2  # REDUCED from 0.3
        negatives.append("mint not renounced")

    if token.get("rugcheck_freeze_renounced") is False:
        score *= 0.4  # REDUCED from 0.5

    # ── BONDING CURVE DETECTION ──
    dex_name = (dex.get("dex") or "").lower()
    liq = dex.get("liquidity_usd") or 0
    on_bonding_curve = False

    # Pump.fun tokens that haven't graduated to PumpSwap
    if dex_name in ("pumpfun", "pump.fun"):
        on_bonding_curve = True
    # Low liquidity + young = likely still on bonding curve
    elif fdv > 0 and liq > 0 and age_hours is not None and age_hours < 24:
        liq_ratio = liq / fdv
        if liq_ratio < 0.02:  # Less than 2% liquidity ratio
            on_bonding_curve = True

    if on_bonding_curve:
        score *= 0.4  # REDUCED from 0.5
        negatives.append("on bonding curve")

    if token.get("rugcheck_freeze_renounced") is False:
        score *= 0.4  # REDUCED from 0.5
        negatives.append("freeze not renounced")

    if token.get("gmgn_burn_status") == "burn":
        score *= 1.10  # REDUCED from 1.15
        if "burned" not in str(positives).lower():
            positives.append("burned")

    if token.get("gmgn_cto_flag"):
        score *= 1.05  # REDUCED from 1.10
        positives.append("CTO")

    if token.get("gmgn_dev_token_farmer"):
        score *= 0.5  # REDUCED from 0.6
        negatives.append("token farmer")

    if token.get("derived_has_mint_authority"):
        score *= 0.2  # REDUCED from 0.3
        negatives.append("HAS MINT AUTHORITY")
    if token.get("derived_has_freeze_authority"):
        score *= 0.4  # REDUCED from 0.5

    # Volume penalties
    buys_h1 = (dex.get("txns_h1", {}) or {}).get("buys", 0) or 0
    sells_h1 = (dex.get("txns_h1", {}) or {}).get("sells", 0) or 0
    if sells_h1 > 0 and buys_h1 == 0:
        score *= 0.05  # REDUCED from 0.1
        negatives.append("ONLY SELLS")
    elif sells_h1 > 0:
        sell_ratio = sells_h1 / (buys_h1 + sells_h1)
        SELL_RATIO_THRESHOLD = 0.7  # Keep same threshold
        if sell_ratio > SELL_RATIO_THRESHOLD:
            score *= 0.2  # REDUCED from 0.3
            negatives.append(f"HEAVY SELLS ({sell_ratio:.0%})")

    if vol_h24 > 0 and vol_h1 > 0:
        STAGNANT_VOLUME_RATIO = 0.05  # Keep same threshold
        if vol_h1 < vol_h24 * STAGNANT_VOLUME_RATIO:
            # Reduce penalty for tokens with strong fundamentals
            # Only apply penalty if FDV is low or holder count is low
            holder_count = token.get("gmgn_holder_count", 0) or 0
            if fdv > 1_000_000 or holder_count > 1000:
                score *= 0.7  # Less penalty for strong tokens
            else:
                score *= 0.3  # Keep penalty for weak tokens
            negatives.append("stagnant volume")

    buys_h6 = (dex.get("txns_h6", {}) or {}).get("buys", 0) or 0
    sells_h6 = (dex.get("txns_h6", {}) or {}).get("sells", 0) or 0
    total_h6 = buys_h6 + sells_h6
    if total_h6 == 0 and age_hours and age_hours > 1:
        # Reduce penalty for tokens with strong fundamentals
        holder_count = token.get("gmgn_holder_count", 0) or 0
        if fdv > 1_000_000 or holder_count > 1000:
            score *= 0.6  # Less penalty for strong tokens
        else:
            score *= 0.2  # Keep penalty for weak tokens
        negatives.append("no txns in 6h")

    # RugCheck
    rc_score = token.get("rugcheck_score", 0)
    if rc_score > 10:
        score *= 0.1  # REDUCED from 0.2
    elif rc_score > 5:
        score *= 0.4  # REDUCED from 0.5

    # ── NEW: PENALTY FOR ZERO SOCIAL SIGNALS ──
    if channel_count == 0 and mentions == 0 and social == 0 and tw_sent == 0:
        score *= 0.5  # NEW penalty
        negatives.append("no social signals")

    # ── NEW: PENALTY FOR VERY LOW FDV ──
    if fdv > 0 and fdv < 10_000:
        score *= 0.7  # NEW penalty for micro-cap tokens
        negatives.append("micro-cap (<$10K FDV)")

    # ── NEW: BONUS FOR STRONG FUNDAMENTALS ──
    # Bonus for high FDV (established token)
    if fdv > 10_000_000:
        score *= 1.3  # 30% bonus for $10M+ FDV
        positives.append("high FDV ($10M+)")
    elif fdv > 1_000_000:
        score *= 1.2  # 20% bonus for $1M+ FDV
        positives.append("good FDV ($1M+)")
    elif fdv > 100_000:
        score *= 1.1  # 10% bonus for $100K+ FDV

    # Bonus for high holder count (well-distributed)
    holder_count = token.get("gmgn_holder_count", 0) or 0
    if holder_count > 10000:
        score *= 1.3  # 30% bonus for 10K+ holders
        positives.append("high holder count (10K+)")
    elif holder_count > 5000:
        score *= 1.2  # 20% bonus for 5K+ holders
        positives.append("good holder count (5K+)")
    elif holder_count > 1000:
        score *= 1.1  # 10% bonus for 1K+ holders

    # Bonus for high liquidity (deep pools)
    liquidity = dex.get("liquidity_usd", 0) or 0
    if liquidity > 500_000:
        score *= 1.3  # 30% bonus for $500K+ liquidity
        positives.append("high liquidity ($500K+)")
    elif liquidity > 100_000:
        score *= 1.2  # 20% bonus for $100K+ liquidity
        positives.append("good liquidity ($100K+)")
    elif liquidity > 50_000:
        score *= 1.1  # 10% bonus for $50K+ liquidity

    # ── CHART SENTIMENT (OHLCV → Bonsai) ──
    chart_mult = token.get("chart_multiplier", 1.0)
    if chart_mult != 1.0:
        score *= chart_mult
    sentiment = token.get("chart_sentiment", "neutral")
    reason = token.get("chart_reason", "") or ""
    if sentiment == "bullish":
        positives.append("chart bullish" + (f": {reason}" if reason else ""))
    elif sentiment == "bearish":
        negatives.append("chart bearish" + (f": {reason}" if reason else ""))

    return round(score, 2), positives, negatives


def test_revised_scoring():
    """Test the revised scoring with sample tokens."""
    # Sample tokens from the user's list
    test_tokens = [
        {
            "symbol": "StarReach",
            "dex": {
                "fdv": 17894,
                "volume_h24": 26630,
                "volume_h1": 26630,
                "age_hours": 0.9,
                "price_change_h1": 315,
                "price_change_h6": 315,
                "price_change_h24": 315,
            },
            "channel_count": 0,
            "mentions": 0,
            "gmgn_smart_wallets": 0,
        },
        {
            "symbol": "GiGi",
            "dex": {
                "fdv": 20095,
                "volume_h24": 54271,
                "volume_h1": 52341,
                "age_hours": 1.4,
                "price_change_h1": 190,
                "price_change_h6": 453,
                "price_change_h24": 453,
            },
            "channel_count": 0,
            "mentions": 0,
            "gmgn_smart_wallets": 0,
        },
    ]

    print("Testing revised scoring:")
    for token in test_tokens:
        score, positives, negatives = revised_score_token(token)
        print(f"\n{token['symbol']}:")
        print("  Old score: ~37.0 (StarReach) or ~16.0 (GiGi)")
        print(f"  New score: {score}")
        print(f"  Positives: {positives}")
        print(f"  Negatives: {negatives}")


if __name__ == "__main__":
    test_revised_scoring()
