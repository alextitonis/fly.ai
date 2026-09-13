from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PositionRecord:
    symbol: str
    short_exchange: str
    long_exchange: str
    notional_usd: float
    short_entry_price: float
    long_entry_price: float


@dataclass(frozen=True)
class CloseSummary:
    symbol: str
    realized_pnl_usd: float
    funding_pnl_usd: float
    fees_usd: float


class PositionLedger:
    def __init__(self):
        self._open: dict[str, PositionRecord] = {}

    def is_open(self, symbol: str) -> bool:
        return symbol in self._open

    def open_pair(
        self,
        symbol: str,
        short_exchange: str,
        long_exchange: str,
        notional_usd: float,
        short_entry_price: float,
        long_entry_price: float,
    ) -> None:
        self._open[symbol] = PositionRecord(
            symbol=symbol,
            short_exchange=short_exchange,
            long_exchange=long_exchange,
            notional_usd=notional_usd,
            short_entry_price=short_entry_price,
            long_entry_price=long_entry_price,
        )

    def close_pair(
        self,
        symbol: str,
        short_exit_price: float,
        long_exit_price: float,
        funding_pnl_usd: float,
        fees_usd: float,
    ) -> CloseSummary:
        rec = self._open.pop(symbol)
        qty_short = rec.notional_usd / rec.short_entry_price
        qty_long = rec.notional_usd / rec.long_entry_price

        short_pnl = (rec.short_entry_price - short_exit_price) * qty_short
        long_pnl = (long_exit_price - rec.long_entry_price) * qty_long
        realized = short_pnl + long_pnl + funding_pnl_usd - fees_usd

        return CloseSummary(
            symbol=symbol,
            realized_pnl_usd=realized,
            funding_pnl_usd=funding_pnl_usd,
            fees_usd=fees_usd,
        )
