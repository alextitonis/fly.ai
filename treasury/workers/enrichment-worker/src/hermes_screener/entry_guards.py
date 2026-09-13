"""
Entry Guard System
==================

Evaluates whether a token should be allowed through screening based on regime,
security posture, and loss streak patterns. Prevents repeatedly selecting tokens
from failing conditions.

Adapted from memecoin-bot's risk/guards.py pattern for the token screening pipeline.

Usage:
    from hermes_screener.entry_guards import evaluate_entry_guard

    result = evaluate_entry_guard(
        token={"regime": "caution", "security_verdict": "medium_risk", ...},
        history=[{"symbol": "ABC", "regime": "caution", "result": "loss"}, ...],
        base_threshold=0.74,
    )
    if result.allowed:
        # Use result.adjusted_score_threshold for filtering
        pass
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(slots=True)
class EntryGuardResult:
    allowed: bool
    adjusted_score_threshold: float
    size_multiplier: float
    reasons: list[str]
    cooldown_active: bool
    regime_loss_streak: int
    source_loss_streak: int
    regime: str
    source: str
    security_verdict: str

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["adjusted_score_threshold"] = round(float(payload["adjusted_score_threshold"]), 4)
        payload["size_multiplier"] = round(float(payload["size_multiplier"]), 4)
        return payload


def evaluate_entry_guard(
    token: dict[str, Any],
    *,
    history: list[dict[str, Any]] | None = None,
    base_threshold: float = 0.74,
    cooldown_loss_streak: int = 2,
    recent_window: int = 12,
) -> EntryGuardResult:
    """
    Evaluate entry guard for a token candidate.

    Tightens thresholds and reduces sizing based on:
    - Market regime (hazard=euphoria→risk_on→balanced→caution)
    - Security verdict (high_risk/medium_risk/low_risk)
    - Loss streak in same regime or source
    """
    regime = str(token.get("regime", "unknown") or "unknown")
    source = str(token.get("source", "unknown") or "unknown")
    security_verdict = str(token.get("security_verdict", "unknown") or "unknown").lower()

    adjusted_threshold = float(base_threshold)
    size_multiplier = 1.0
    reasons: list[str] = []

    # ── Regime-based adjustments ──
    regime_profiles = {
        "risk_on": (1.0, 0.00),
        "balanced": (0.9, 0.00),
        "euphoria": (0.7, 0.05),
        "caution": (0.5, 0.08),
        "hazard": (0.0, 0.20),
    }
    regime_mult, threshold_bump = regime_profiles.get(regime, (0.85, 0.00))
    size_multiplier *= regime_mult
    adjusted_threshold += threshold_bump

    if regime == "hazard":
        reasons.append("hazard_regime_blocked")
    elif regime == "euphoria":
        reasons.append("euphoria_size_reduced")
    elif regime == "caution":
        reasons.append("caution_regime_tightened")

    # ── Security-based adjustments ──
    if security_verdict == "medium_risk":
        size_multiplier *= 0.8
        adjusted_threshold += 0.03
        reasons.append("medium_risk_security_tightened")
    elif security_verdict == "high_risk":
        size_multiplier = 0.0
        adjusted_threshold = max(adjusted_threshold, 1.0)
        reasons.append("high_risk_security_blocked")

    # ── Loss streak cooldowns ──
    history = history or []
    recent_sells = [t for t in history if t.get("result") == "loss"][-recent_window:]

    regime_loss_streak = _loss_streak(recent_sells, key="regime", value=regime)
    source_loss_streak = _loss_streak(recent_sells, key="source", value=source)

    cooldown_active = False
    if regime != "unknown" and regime_loss_streak >= cooldown_loss_streak:
        reasons.append("regime_loss_streak_cooldown")
        cooldown_active = True
    if source != "unknown" and source_loss_streak >= cooldown_loss_streak:
        reasons.append("source_loss_streak_cooldown")
        cooldown_active = True

    adjusted_threshold = round(min(max(adjusted_threshold, 0.0), 1.0), 4)
    size_multiplier = round(min(max(size_multiplier, 0.0), 1.0), 4)
    allowed = (not cooldown_active) and size_multiplier > 0

    return EntryGuardResult(
        allowed=allowed,
        adjusted_score_threshold=adjusted_threshold,
        size_multiplier=size_multiplier,
        reasons=reasons,
        cooldown_active=cooldown_active,
        regime_loss_streak=regime_loss_streak,
        source_loss_streak=source_loss_streak,
        regime=regime,
        source=source,
        security_verdict=security_verdict,
    )


def summarize_guard_state(
    history: list[dict[str, Any]],
    *,
    cooldown_loss_streak: int = 2,
    recent_window: int = 12,
) -> dict[str, Any]:
    """
    Summarize current entry guard state across all regimes and sources.
    Useful for operator-facing dashboards.
    """
    recent_sells = [t for t in history if t.get("result") == "loss"][-recent_window:]
    regime_loss_streaks = _loss_streaks_by_key(recent_sells, key="regime")
    source_loss_streaks = _loss_streaks_by_key(recent_sells, key="source")

    return {
        "cooldown_loss_streak": cooldown_loss_streak,
        "recent_trade_window": recent_window,
        "recent_loss_count": len(recent_sells),
        "regime_loss_streaks": regime_loss_streaks,
        "source_loss_streaks": source_loss_streaks,
        "active_regime_cooldowns": sorted(
            [key for key, streak in regime_loss_streaks.items() if streak >= cooldown_loss_streak]
        ),
        "active_source_cooldowns": sorted(
            [key for key, streak in source_loss_streaks.items() if streak >= cooldown_loss_streak]
        ),
    }


def _loss_streak(trades: list[dict[str, Any]], *, key: str, value: str) -> int:
    """Count consecutive losses matching a key/value pair (most recent first)."""
    streak = 0
    for trade in reversed(trades):
        if str(trade.get(key, "unknown") or "unknown") != value:
            continue
        if float(trade.get("pnl", 0.0) or 0.0) < 0:
            streak += 1
            continue
        break
    return streak


def _loss_streaks_by_key(trades: list[dict[str, Any]], *, key: str) -> dict[str, int]:
    """Get loss streaks for each unique value of a key."""
    values = {str(t.get(key, "unknown") or "unknown") for t in trades}
    values.discard("unknown")
    return {v: _loss_streak(trades, key=key, value=v) for v in sorted(values)}
