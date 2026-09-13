"""
Execution Cost Model
====================

Models round-trip trading costs (slippage + fees), computes expected net edge,
and adjusts token scores for execution realism. Prevents scoring tokens that
look great on paper but have poor tradeable edge.

Adapted from memecoin-bot's execution/routing.py _edge_fields pattern.

Usage:
    from hermes_screener.execution_cost import compute_edge, apply_execution_drag

    edge = compute_edge(
        liquidity_usd=50_000,
        fdv=500_000,
        volume_h1=5_000,
        position_size_usd=500,
    )
    adjusted_score = apply_execution_drag(raw_score, edge)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# Default parameters tuned for memecoin DEX trading
DEFAULT_FEE_BPS = 60  # 0.6% round-trip (30 bps each way typical DEX fee)
DEFAULT_SLIPPAGE_BUFFER = 1.15  # 15% buffer on estimated slippage
DEFAULT_EXIT_SLIPPAGE_MULT = 1.1  # Exit slippage = entry * 1.1


@dataclass(slots=True, frozen=True)
class ExecutionEdge:
    """Execution cost and edge metrics for a token."""

    # Cost components
    entry_slippage_pct: float
    exit_slippage_pct: float
    round_trip_fee_pct: float
    round_trip_cost_pct: float
    round_trip_cost_usd: float

    # Edge metrics
    price_impact_pct: float
    expected_net_return_pct: float
    expected_win_probability: float
    net_edge_score: float

    # Quality signals
    tradeable: bool
    liquidity_tier: str  # "deep", "adequate", "thin", "illiquid"
    edge_verdict: str  # "positive", "marginal", "negative", "untradeable"

    def to_dict(self) -> dict[str, Any]:
        return {
            "entry_slippage_pct": round(self.entry_slippage_pct, 6),
            "exit_slippage_pct": round(self.exit_slippage_pct, 6),
            "round_trip_fee_pct": round(self.round_trip_fee_pct, 6),
            "round_trip_cost_pct": round(self.round_trip_cost_pct, 6),
            "round_trip_cost_usd": round(self.round_trip_cost_usd, 6),
            "price_impact_pct": round(self.price_impact_pct, 6),
            "expected_net_return_pct": round(self.expected_net_return_pct, 6),
            "expected_win_probability": round(self.expected_win_probability, 6),
            "net_edge_score": round(self.net_edge_score, 6),
            "tradeable": self.tradeable,
            "liquidity_tier": self.liquidity_tier,
            "edge_verdict": self.edge_verdict,
        }


def compute_edge(
    *,
    liquidity_usd: float,
    fdv: float,
    volume_h1: float = 0.0,
    position_size_usd: float = 500.0,
    fee_bps: int = DEFAULT_FEE_BPS,
    slippage_buffer: float = DEFAULT_SLIPPAGE_BUFFER,
    price_change_h1: float | None = None,
) -> ExecutionEdge:
    """
    Compute execution edge for a token given liquidity and trade parameters.

    Adapts memecoin-bot's _edge_fields logic with:
    - Price impact estimated from liquidity depth
    - Fee/slippage-adjusted expected return
    - Win probability estimation
    - Tradeability gate
    """
    # ── Price impact estimation ──
    # DEX price impact ≈ trade_size / (liquidity * depth_factor)
    # Higher volume relative to liquidity = deeper pool
    depth_factor = 12.0 if volume_h1 > 0 else 8.0
    if liquidity_usd <= 0:
        price_impact_pct = 1.0  # Complete illiquidity
    else:
        price_impact_pct = min(0.50, position_size_usd / (liquidity_usd * depth_factor))

    # ── Slippage estimation ──
    # Base slippage from price impact, scaled by buffer
    base_slippage_bps = int(price_impact_pct * 10_000)
    entry_slippage_bps = max(90, int(base_slippage_bps * slippage_buffer))
    entry_slippage_pct = entry_slippage_bps / 10_000
    exit_slippage_pct = entry_slippage_pct * DEFAULT_EXIT_SLIPPAGE_MULT

    # ── Fee calculation ──
    round_trip_fee_pct = (fee_bps / 10_000) * 2  # Entry + exit fees

    # ── Total round-trip cost ──
    round_trip_cost_pct = entry_slippage_pct + exit_slippage_pct + round_trip_fee_pct
    round_trip_cost_usd = position_size_usd * round_trip_cost_pct

    # ── Expected return ──
    # Use h1 price change as alpha horizon if available
    if price_change_h1 is not None:
        expected_return_pct = price_change_h1 / 100.0
    else:
        # Conservative estimate from volume dynamics
        if liquidity_usd > 0 and volume_h1 > 0:
            vol_liq_ratio = volume_h1 / liquidity_usd
            expected_return_pct = min(0.50, vol_liq_ratio * 0.1)
        else:
            expected_return_pct = 0.0

    expected_net_return_pct = expected_return_pct - round_trip_cost_pct

    # ── Win probability ──
    # Higher price impact = lower win probability (harder to exit profitably)
    expected_win_probability = max(0.05, min(0.95, 0.55 - price_impact_pct + (expected_return_pct * 0.3)))

    # ── Net edge score ──
    net_edge_score = expected_net_return_pct * 1000  # Scale for readability

    # ── Liquidity tier ──
    if liquidity_usd >= 500_000:
        liquidity_tier = "deep"
    elif liquidity_usd >= 100_000:
        liquidity_tier = "adequate"
    elif liquidity_usd >= 25_000:
        liquidity_tier = "thin"
    else:
        liquidity_tier = "illiquid"

    # ── Tradeability gate ──
    tradeable = (
        liquidity_usd >= 25_000
        and price_impact_pct < 0.10  # Max 10% price impact
        and round_trip_cost_pct < 0.15  # Max 15% total cost
    )

    # ── Edge verdict ──
    if not tradeable:
        edge_verdict = "untradeable"
    elif net_edge_score > 50:
        edge_verdict = "positive"
    elif net_edge_score > 0:
        edge_verdict = "marginal"
    else:
        edge_verdict = "negative"

    return ExecutionEdge(
        entry_slippage_pct=entry_slippage_pct,
        exit_slippage_pct=exit_slippage_pct,
        round_trip_fee_pct=round_trip_fee_pct,
        round_trip_cost_pct=round_trip_cost_pct,
        round_trip_cost_usd=round_trip_cost_usd,
        price_impact_pct=price_impact_pct,
        expected_net_return_pct=expected_net_return_pct,
        expected_win_probability=expected_win_probability,
        net_edge_score=net_edge_score,
        tradeable=tradeable,
        liquidity_tier=liquidity_tier,
        edge_verdict=edge_verdict,
    )


def apply_execution_drag(score: float, edge: ExecutionEdge) -> float:
    """
    Adjust a token score based on execution edge quality.

    Applies multiplicative penalties for poor tradeability:
    - Untradeable: 0.0x (killed)
    - Negative edge: 0.3x (heavy penalty)
    - Marginal edge: 0.8x (moderate penalty)
    - Positive edge: no penalty
    """
    if not edge.tradeable:
        return 0.0

    if edge.edge_verdict == "negative":
        return round(score * 0.3, 2)
    elif edge.edge_verdict == "marginal":
        return round(score * 0.8, 2)

    return round(score, 2)


def compute_token_edge(
    token: dict[str, Any],
    position_size_usd: float = 500.0,
) -> ExecutionEdge:
    """
    Convenience function: extract liquidity/fdv/volume from token dict
    and compute edge.
    """
    dex = token.get("dex") or {}
    return compute_edge(
        liquidity_usd=dex.get("liquidity_usd") or 0,
        fdv=dex.get("fdv") or dex.get("market_cap") or 0,
        volume_h1=dex.get("volume_h1") or 0,
        position_size_usd=position_size_usd,
        price_change_h1=dex.get("price_change_h1"),
    )
