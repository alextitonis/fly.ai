from __future__ import annotations

from typing import Any

from perps_arb.adapters.base import AdapterConfig, BaseAdapter
from perps_arb.models import FundingQuote
from perps_arb.sizing import MarketMeta, SizeCalculator


class CcxtPerpsAdapter(BaseAdapter):
    def __init__(
        self,
        config: AdapterConfig,
        exchange_client: Any,
        dry_run_balance_usd: float = 10_000.0,
    ):
        super().__init__(config)
        self.exchange = exchange_client
        self.dry_run_balance_usd = dry_run_balance_usd
        self.sizer = SizeCalculator()

    def fetch_funding_quotes(self, symbols: list[str]) -> list[FundingQuote]:
        quotes: list[FundingQuote] = []
        for symbol in symbols:
            try:
                fr = self.exchange.fetch_funding_rate(symbol)
                ticker = self.exchange.fetch_ticker(symbol)
            except Exception:
                continue

            funding_rate = float(fr.get("fundingRate") or 0.0)
            interval_hours = int(fr.get("interval") or self.config.default_interval_hours)
            mark_price = float(
                fr.get("markPrice")
                or ticker.get("mark")
                or ticker.get("last")
                or 0.0
            )
            quotes.append(
                FundingQuote(
                    exchange=self.config.name,
                    symbol=symbol,
                    funding_rate=funding_rate,
                    funding_interval_hours=interval_hours,
                    mark_price=mark_price,
                )
            )
        return quotes

    def fetch_balance_usd(self) -> float:
        try:
            bal = self.exchange.fetch_balance()
            usdt = bal.get("USDT", {})
            return float(usdt.get("free") or usdt.get("total") or self.dry_run_balance_usd)
        except Exception:
            return self.dry_run_balance_usd

    def fetch_market_meta(self, symbol: str) -> MarketMeta:
        market = self.exchange.market(symbol)
        limits = market.get("limits", {})
        amount_limits = limits.get("amount", {})
        cost_limits = limits.get("cost", {})
        precision = market.get("precision", {})

        min_amount = float(amount_limits.get("min") or 0.0)
        min_notional = float(cost_limits.get("min") or 0.0)
        amount_step = 10 ** (-int(precision.get("amount", 3))) if precision.get("amount") is not None else 0.001

        return MarketMeta(
            min_amount=max(min_amount, amount_step),
            amount_step=amount_step,
            min_notional=min_notional,
        )

    def place_market_order(
        self,
        symbol: str,
        side: str,
        notional_usd: float,
        reduce_only: bool = False,
    ) -> dict:
        ticker = self.exchange.fetch_ticker(symbol)
        px = float(ticker.get("last") or ticker.get("mark") or 0.0)
        meta = self.fetch_market_meta(symbol)
        amount = self.sizer.amount_for_notional(notional_usd=notional_usd, price=px, market=meta)
        if amount <= 0:
            raise ValueError(f"Order amount rounds to zero for {symbol} on {self.config.name}")
        params = {"reduceOnly": reduce_only}
        return self.exchange.create_order(symbol, "market", side, amount, None, params)
