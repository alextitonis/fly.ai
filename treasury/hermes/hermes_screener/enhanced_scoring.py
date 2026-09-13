"""
Enhanced Token Scoring Pipeline
=================================

Wraps `revised_score_token` with the new memecoin-bot-inspired modules:
- Regime classification (market condition awareness)
- Entry guard evaluation (loss streak cooldowns, regime gates)
- Execution cost modeling (round-trip cost, net edge, tradeability)

This is the recommended entry point for the scoring pipeline.

Usage:
    from hermes_screener.enhanced_scoring import enhanced_score_token

    result = enhanced_score_token(token_dict)
    print(result.score, result.regime, result.edge_verdict)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from hermes_screener.regime import (
    RegimeResult,
    apply_regime_to_score,
    classify_regime,
)
from hermes_screener.entry_guards import (
    EntryGuardResult,
    evaluate_entry_guard,
)
from hermes_screener.execution_cost import (
    ExecutionEdge,
    apply_execution_drag,
    compute_token_edge,
)
from hermes_screener.revised_scoring import revised_score_token


@dataclass(slots=True)
class EnhancedScoreResult:
    """Complete scoring result with regime, guard, and execution context."""

    # Core score
    raw_score: float
    final_score: float
    positives: list[str]
    negatives: list[str]

    # Regime
    regime: str
    regime_multiplier: float
    regime_reasons: list[str]

    # Entry guard
    guard_allowed: bool
    guard_multiplier: float
    guard_threshold: float
    guard_reasons: list[str]

    # Execution edge
    edge_verdict: str
    edge_net_return_pct: float
    edge_tradeable: bool
    edge_liquidity_tier: str
    edge_cost_pct: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "raw_score": round(self.raw_score, 2),
            "final_score": round(self.final_score, 2),
            "positives": self.positives,
            "negatives": self.negatives,
            "regime": self.regime,
            "regime_multiplier": round(self.regime_multiplier, 4),
            "regime_reasons": self.regime_reasons,
            "guard_allowed": self.guard_allowed,
            "guard_multiplier": round(self.guard_multiplier, 4),
            "guard_threshold": round(self.guard_threshold, 4),
            "guard_reasons": self.guard_reasons,
            "edge_verdict": self.edge_verdict,
            "edge_net_return_pct": round(self.edge_net_return_pct, 6),
            "edge_tradeable": self.edge_tradeable,
            "edge_liquidity_tier": self.edge_liquidity_tier,
            "edge_cost_pct": round(self.edge_cost_pct, 6),
        }


def enhanced_score_token(
    token: dict[str, Any],
    *,
    position_size_usd: float = 500.0,
    screening_history: list[dict[str, Any]] | None = None,
    base_threshold: float = 0.74,
) -> EnhancedScoreResult:
    """
    Full enhanced scoring pipeline.

    Steps:
    1. Classify market regime
    2. Run original revised scoring
    3. Apply regime multiplier to score
    4. Evaluate entry guard (with history-based cooldowns)
    5. Compute execution edge
    6. Apply execution drag to score
    """
    # ── Step 1: Regime classification ──
    regime_result = classify_regime(token)
    token["regime"] = regime_result.regime

    # ── Step 2: Original scoring ──
    raw_score, positives, negatives = revised_score_token(token)

    # ── Step 3: Regime multiplier ──
    regime_adjusted = apply_regime_to_score(raw_score, regime_result.regime)

    # ── Step 4: Entry guard ──
    guard_result = evaluate_entry_guard(
        token,
        history=screening_history,
        base_threshold=base_threshold,
    )

    # If guard blocks the token, set score to 0
    if not guard_result.allowed:
        return EnhancedScoreResult(
            raw_score=raw_score,
            final_score=0.0,
            positives=positives,
            negatives=negatives + guard_result.reasons,
            regime=regime_result.regime,
            regime_multiplier=regime_result.risk_multiplier,
            regime_reasons=regime_result.reasons,
            guard_allowed=False,
            guard_multiplier=guard_result.size_multiplier,
            guard_threshold=guard_result.adjusted_score_threshold,
            guard_reasons=guard_result.reasons,
            edge_verdict="blocked_by_guard",
            edge_net_return_pct=0.0,
            edge_tradeable=False,
            edge_liquidity_tier="unknown",
            edge_cost_pct=0.0,
        )

    # ── Step 5: Execution edge ──
    edge = compute_token_edge(token, position_size_usd=position_size_usd)

    # ── Step 6: Execution drag ──
    # Apply regime multiplier first, then execution drag
    after_regime = regime_adjusted
    final_score = apply_execution_drag(after_regime, edge)

    # Also apply guard size multiplier to final score
    final_score = round(final_score * guard_result.size_multiplier, 2)

    # Collect additional negatives from execution analysis
    if not edge.tradeable:
        negatives.append(f"untradeable ({edge.liquidity_tier})")
    elif edge.edge_verdict == "negative":
        negatives.append(f"negative edge ({edge.edge_net_return_pct:.1%})")
    elif edge.edge_verdict == "marginal":
        negatives.append(f"marginal edge ({edge.edge_net_return_pct:.1%})")

    return EnhancedScoreResult(
        raw_score=raw_score,
        final_score=final_score,
        positives=positives,
        negatives=negatives,
        regime=regime_result.regime,
        regime_multiplier=regime_result.risk_multiplier,
        regime_reasons=regime_result.reasons,
        guard_allowed=True,
        guard_multiplier=guard_result.size_multiplier,
        guard_threshold=guard_result.adjusted_score_threshold,
        guard_reasons=guard_result.reasons,
        edge_verdict=edge.edge_verdict,
        edge_net_return_pct=edge.expected_net_return_pct,
        edge_tradeable=edge.tradeable,
        edge_liquidity_tier=edge.liquidity_tier,
        edge_cost_pct=edge.round_trip_cost_pct,
    )


def score_token_batch(
    tokens: list[dict[str, Any]],
    *,
    position_size_usd: float = 500.0,
    base_threshold: float = 0.74,
    min_final_score: float = 0.0,
) -> list[dict[str, Any]]:
    """
    Score a batch of tokens with the enhanced pipeline.
    Returns list of token dicts enriched with scoring metadata, sorted by final_score DESC.
    """
    results: list[dict[str, Any]] = []
    history: list[dict[str, Any]] = []  # Cumulative history for loss streaks

    for token in tokens:
        result = enhanced_score_token(
            token,
            position_size_usd=position_size_usd,
            screening_history=history,
            base_threshold=base_threshold,
        )

        # Enrich token dict with scoring metadata
        token["enhanced_score"] = result.final_score
        token["raw_score"] = result.raw_score
        token["regime"] = result.regime
        token["regime_multiplier"] = result.regime_multiplier
        token["edge_verdict"] = result.edge_verdict
        token["edge_tradeable"] = result.edge_tradeable
        token["edge_liquidity_tier"] = result.edge_liquidity_tier
        token["edge_net_return_pct"] = result.edge_net_return_pct
        token["guard_allowed"] = result.guard_allowed
        token["positives"] = result.positives
        token["negatives"] = result.negatives

        if result.final_score >= min_final_score:
            results.append(token)

        # Track in history for loss streak calculation
        history.append(
            {
                "symbol": token.get("symbol", "unknown"),
                "regime": result.regime,
                "source": token.get("source", "unknown"),
                "result": "win" if result.final_score > base_threshold else "loss",
                "pnl": result.final_score - base_threshold,
            }
        )

    # Sort by final score descending
    results.sort(key=lambda t: t.get("enhanced_score", 0), reverse=True)
    return results
