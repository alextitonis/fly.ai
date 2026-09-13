from __future__ import annotations

from dataclasses import dataclass

from perps_arb.models import FundingQuote
from perps_arb.sizing import MarketMeta


@dataclass
class AdapterConfig:
    name: str
    default_interval_hours: int = 8


class BaseAdapter:
    def __init__(self, config: AdapterConfig):
        self.config = config

    def fetch_funding_quotes(self, symbols: list[str]) -> list[FundingQuote]:
        raise NotImplementedError

    def fetch_balance_usd(self) -> float:
        raise NotImplementedError

    def fetch_market_meta(self, symbol: str) -> MarketMeta:
        raise NotImplementedError

    def place_market_order(
        self,
        symbol: str,
        side: str,
        notional_usd: float,
        reduce_only: bool = False,
    ) -> dict:
        raise NotImplementedError
