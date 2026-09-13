from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReconcileResult:
    needs_rehedge: bool
    rehedge_side: str | None
    rehedge_notional_usd: float
    mismatch_ratio: float


def reconcile_hedge_fills(
    short_filled_usd: float,
    long_filled_usd: float,
    max_slippage_ratio: float = 0.05,
) -> ReconcileResult:
    gross = max(abs(short_filled_usd), abs(long_filled_usd), 1e-9)
    diff = short_filled_usd - long_filled_usd
    mismatch_ratio = abs(diff) / gross

    if mismatch_ratio <= max_slippage_ratio:
        return ReconcileResult(False, None, 0.0, mismatch_ratio)

    # If short > long, we need to buy more long exposure; otherwise sell/trim long
    rehedge_side = "buy" if diff > 0 else "sell"
    return ReconcileResult(True, rehedge_side, abs(diff), mismatch_ratio)
