from dataclasses import dataclass

from .models import Opportunity


@dataclass(frozen=True)
class RiskLimits:
    max_notional_per_trade: float
    max_total_notional: float
    max_open_positions: int
    max_delta_usd: float


class RiskManager:
    def __init__(self, limits: RiskLimits):
        self.limits = limits

    def allow(
        self,
        opportunity: Opportunity,
        balances: dict[str, float],
        open_notional: float,
        open_positions: int,
    ) -> tuple[bool, str]:
        if opportunity.est_trade_notional > self.limits.max_notional_per_trade:
            return False, "notional per trade exceeds limit"

        if open_notional + opportunity.est_trade_notional > self.limits.max_total_notional:
            return False, "total notional would exceed limit"

        if open_positions + 1 > self.limits.max_open_positions:
            return False, "open positions would exceed limit"

        if opportunity.est_delta_usd > self.limits.max_delta_usd:
            return False, "delta exceeds limit"

        short_bal = balances.get(opportunity.short_exchange, 0.0)
        long_bal = balances.get(opportunity.long_exchange, 0.0)
        required_margin_each = opportunity.est_trade_notional * 0.1

        if short_bal < required_margin_each or long_bal < required_margin_each:
            return False, "insufficient balance on one or both exchanges"

        return True, "ok"
