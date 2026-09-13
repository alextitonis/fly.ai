from __future__ import annotations

from collections import defaultdict

from .models import FundingQuote, Opportunity


def _annualization_factor(interval_hours: int) -> float:
    return (24.0 / max(interval_hours, 1)) * 365.0


def find_best_opportunities(
    quotes: list[FundingQuote],
    taker_fee_bps: float,
    slippage_bps: float,
    min_net_apr: float,
    top_n: int,
    default_notional_usd: float = 1000.0,
) -> list[Opportunity]:
    grouped: dict[str, list[FundingQuote]] = defaultdict(list)
    for q in quotes:
        grouped[q.symbol].append(q)

    opportunities: list[Opportunity] = []
    one_time_cost_fraction = ((taker_fee_bps + slippage_bps) * 4.0) / 10_000.0

    for symbol, rows in grouped.items():
        if len(rows) < 2:
            continue

        short_leg = max(rows, key=lambda x: x.funding_rate)
        long_leg = min(rows, key=lambda x: x.funding_rate)

        spread = short_leg.funding_rate - long_leg.funding_rate
        interval_hours = max(short_leg.funding_interval_hours, long_leg.funding_interval_hours)
        gross_apr = spread * _annualization_factor(interval_hours)
        net_apr = gross_apr - one_time_cost_fraction

        avg_price = max((short_leg.mark_price + long_leg.mark_price) / 2.0, 1e-9)
        basis = abs(short_leg.mark_price - long_leg.mark_price) / avg_price
        est_delta_usd = default_notional_usd * basis

        if net_apr < min_net_apr:
            continue

        opportunities.append(
            Opportunity(
                symbol=symbol,
                short_exchange=short_leg.exchange,
                long_exchange=long_leg.exchange,
                short_rate=short_leg.funding_rate,
                long_rate=long_leg.funding_rate,
                gross_apr=gross_apr,
                net_apr=net_apr,
                est_trade_notional=default_notional_usd,
                est_delta_usd=est_delta_usd,
            )
        )

    opportunities.sort(key=lambda x: x.net_apr, reverse=True)
    return opportunities[: max(top_n, 0)]
