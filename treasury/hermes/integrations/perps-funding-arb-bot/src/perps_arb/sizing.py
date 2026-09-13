from __future__ import annotations

from dataclasses import dataclass
import math


@dataclass(frozen=True)
class MarketMeta:
    min_amount: float
    amount_step: float
    min_notional: float


class SizeCalculator:
    def amount_for_notional(self, notional_usd: float, price: float, market: MarketMeta) -> float:
        if price <= 0:
            return 0.0

        raw_amount = notional_usd / price
        if market.amount_step <= 0:
            rounded = raw_amount
        else:
            rounded = math.floor(raw_amount / market.amount_step) * market.amount_step

        if rounded < market.min_amount:
            return 0.0

        if rounded * price < market.min_notional:
            return 0.0

        return float(rounded)
