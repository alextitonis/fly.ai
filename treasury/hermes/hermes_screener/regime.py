"""
Market Regime Classifier
=========================

Classifies tokens into market regimes based on security, momentum, and liquidity signals.
Adapted from memecoin-bot's regime.py pattern with enhancements for multi-chain screening.

Regimes:
  hazard   - Security red flags active, or suspicious/deployer issues
  euphoria - Extreme momentum + strong narrative (parabolic, high risk)
  risk_on  - Healthy conditions, strong fundamentals
  balanced - Moderate conditions, mixed signals
  caution  - Weak signals, high risk, or poor liquidity

Usage:
    from hermes_screener.regime import classify_regime, REGIME_MULTIPLIERS

    regime = classify_regime(token_dict)
    multiplier = REGIME_MULTIPLIERS[regime]
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True, frozen=True)
class RegimeResult:
    regime: str
    risk_multiplier: float
    threshold_bump: float
    reasons: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "regime": self.regime,
            "risk_multiplier": round(self.risk_multiplier, 4),
            "threshold_bump": round(self.threshold_bump, 4),
            "reasons": self.reasons,
        }


# Regime profiles: (position_size_multiplier, entry_threshold_bump)
# Mirrors memecoin-bot's regime_profiles with HERMES-specific tuning
REGIME_PROFILES: dict[str, tuple[float, float]] = {
    "risk_on": (1.0, 0.00),
    "balanced": (0.9, 0.00),
    "euphoria": (0.7, 0.05),
    "caution": (0.5, 0.08),
    "hazard": (0.0, 0.20),
}

# Score multiplier applied during scoring based on regime
REGIME_SCORE_MULTIPLIERS: dict[str, float] = {
    "risk_on": 1.05,
    "balanced": 1.0,
    "euphoria": 0.85,
    "caution": 0.6,
    "hazard": 0.0,
}


def classify_regime(token: dict[str, Any]) -> RegimeResult:
    """
    Classify a token's market regime from enrichment data.

    Adapts the memecoin-bot pattern to HERMES token dict structure:
    - Uses `dex.*` fields for price/volume/liquidity
    - Uses enrichment fields for security signals
    - Uses derived fields for risk indicators
    """
    dex = token.get("dex") or {}
    reasons: list[str] = []

    # Extract security signals (goplus_is_honeypot is generic honeypot flag, not GoPlus-specific)
    honeypot = bool(token.get("gmgn_honeypot") or token.get("goplus_is_honeypot"))
    rugged = bool(token.get("rugcheck_rugged") or token.get("derived_possible_rug"))
    scammed = bool(token.get("defi_scammed"))
    massive_dump = bool(token.get("derived_massive_dump"))
    suspicious_volume = bool(token.get("derived_suspicious_volume"))
    deployer_flagged = bool(token.get("gmgn_dev_token_farmer"))
    mint_authority = bool(token.get("derived_has_mint_authority"))
    freeze_authority = bool(token.get("derived_has_freeze_authority"))

    # Extract market signals
    fdv = dex.get("fdv") or dex.get("market_cap") or 0
    liquidity = dex.get("liquidity_usd") or 0
    vol_h24 = dex.get("volume_h24") or 0
    vol_h1 = dex.get("volume_h1") or 0
    pc_h1 = dex.get("price_change_h1")
    pc_h6 = dex.get("price_change_h6")
    buys_h1 = (dex.get("txns_h1") or {}).get("buys") or 0
    sells_h1 = (dex.get("txns_h1") or {}).get("sells") or 0

    # Social signals
    smart_wallets = token.get("gmgn_smart_wallets") or 0
    channel_count = token.get("channel_count") or 0
    mentions = token.get("mentions") or 0

    # ── HAZARD: Hard security failures ──
    if honeypot:
        reasons.append("honeypot_detected")
        return _build_result("hazard", reasons)
    if rugged:
        reasons.append("rugged")
        return _build_result("hazard", reasons)
    if scammed:
        reasons.append("scammed")
        return _build_result("hazard", reasons)
    if massive_dump:
        reasons.append("massive_dump")
        return _build_result("hazard", reasons)
    if mint_authority:
        reasons.append("has_mint_authority")
        return _build_result("hazard", reasons)

    # Soft hazard triggers (need 2+ to qualify)
    soft_hazard_count = 0
    if suspicious_volume:
        soft_hazard_count += 1
        reasons.append("suspicious_volume")
    if deployer_flagged:
        soft_hazard_count += 1
        reasons.append("deployer_flagged")
    if freeze_authority:
        soft_hazard_count += 1
        reasons.append("has_freeze_authority")
    if liquidity < 10_000 and fdv > 0:
        soft_hazard_count += 1
        reasons.append("very_low_liquidity")

    if soft_hazard_count >= 2:
        return _build_result("hazard", reasons)

    # ── EUPHORIA: Parabolic momentum + strong social ──
    momentum_strong = False
    if pc_h1 is not None and pc_h6 is not None:
        if pc_h1 > 100 and pc_h6 > 200:
            momentum_strong = True

    social_strong = channel_count >= 5 or mentions >= 10 or smart_wallets >= 20
    vol_hot = vol_h24 > 0 and vol_h1 > 0 and vol_h1 > vol_h24 * 0.15

    if momentum_strong and (social_strong or vol_hot):
        reasons.append("euphoria_momentum")
        if social_strong:
            reasons.append("strong_social")
        if vol_hot:
            reasons.append("hot_volume")
        return _build_result("euphoria", reasons)

    # ── RISK_ON: Healthy conditions ──
    has_security_ok = not soft_hazard_count
    has_liquidity = liquidity >= 50_000
    has_smart_money = smart_wallets >= 5
    has_positive_momentum = (pc_h1 is not None and pc_h1 > 5) or (pc_h6 is not None and pc_h6 > 10)
    has_volume = vol_h24 > 10_000
    has_buy_pressure = buys_h1 > sells_h1 if (buys_h1 + sells_h1) > 0 else False

    risk_on_signals = sum(
        [
            has_security_ok,
            has_liquidity,
            has_smart_money,
            has_positive_momentum,
            has_volume,
            has_buy_pressure,
        ]
    )

    if risk_on_signals >= 4 and has_security_ok:
        reasons.append("risk_on_signals")
        return _build_result("risk_on", reasons)

    # ── BALANCED: Moderate conditions ──
    if liquidity >= 25_000 and not soft_hazard_count:
        reasons.append("balanced_conditions")
        return _build_result("balanced", reasons)

    # ── CAUTION: Default fallback for weak signals ──
    if soft_hazard_count > 0:
        reasons.append("soft_risk_flags")
    if liquidity < 25_000:
        reasons.append("low_liquidity")
    reasons.append("caution_default")
    return _build_result("caution", reasons)


def _build_result(regime: str, reasons: list[str]) -> RegimeResult:
    multiplier, threshold_bump = REGIME_PROFILES.get(regime, (0.85, 0.0))
    return RegimeResult(
        regime=regime,
        risk_multiplier=multiplier,
        threshold_bump=threshold_bump,
        reasons=reasons,
    )


def apply_regime_to_score(score: float, regime: str) -> float:
    """Apply regime-based multiplier to a raw score."""
    multiplier = REGIME_SCORE_MULTIPLIERS.get(regime, 1.0)
    return round(score * multiplier, 2)
