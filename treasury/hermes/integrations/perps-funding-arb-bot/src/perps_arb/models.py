from dataclasses import dataclass


@dataclass(frozen=True)
class FundingQuote:
    exchange: str
    symbol: str
    funding_rate: float
    funding_interval_hours: int
    mark_price: float


@dataclass(frozen=True)
class Opportunity:
    symbol: str
    short_exchange: str
    long_exchange: str
    short_rate: float
    long_rate: float
    gross_apr: float
    net_apr: float
    est_trade_notional: float
    est_delta_usd: float
