from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from .accounting import PositionLedger
from .close_rebalance import rebalance_transfer_plan
from .models import FundingQuote, Opportunity
from .reconcile import reconcile_hedge_fills
from .risk import RiskLimits, RiskManager
from .scanner import find_best_opportunities


class ExchangeAdapter(Protocol):
    def fetch_funding_quotes(self, symbols: list[str]) -> list[FundingQuote]: ...

    def fetch_balance_usd(self) -> float: ...

    def fetch_ticker(self, symbol: str) -> dict: ...

    def place_market_order(
        self,
        symbol: str,
        side: str,
        notional_usd: float,
        reduce_only: bool = False,
    ) -> dict: ...


class StateStore(Protocol):
    def save_opportunities(self, opportunities: list[Opportunity]) -> None: ...

    def save_execution(self, record: dict) -> None: ...

    def save_close(self, record: dict) -> None: ...

    def save_rebalance(self, record: dict) -> None: ...


@dataclass(frozen=True)
class RunResult:
    executed: bool
    reason: str
    opportunity: Opportunity | None = None


class ArbEngine:
    def __init__(
        self,
        adapters: dict[str, ExchangeAdapter],
        symbols: list[str],
        risk_limits: RiskLimits,
        taker_fee_bps: float,
        slippage_bps: float,
        min_net_apr: float,
        dry_run: bool,
        store: StateStore,
        max_fill_mismatch_ratio: float = 0.05,
        rebalance_targets_usd: dict[str, float] | None = None,
        top_n: int = 5,
    ):
        self.adapters = adapters
        self.symbols = symbols
        self.risk = RiskManager(risk_limits)
        self.taker_fee_bps = taker_fee_bps
        self.slippage_bps = slippage_bps
        self.min_net_apr = min_net_apr
        self.dry_run = dry_run
        self.store = store
        self.max_fill_mismatch_ratio = max_fill_mismatch_ratio
        self.rebalance_targets_usd = rebalance_targets_usd or {}
        self.top_n = top_n
        self.ledger = PositionLedger()
        self._recover_open_positions()

    def _recover_open_positions(self) -> None:
        loader = getattr(self.store, "load_open_positions", None)
        if not callable(loader):
            return
        rows = loader() or []
        for r in rows:
            symbol = r.get("symbol")
            short_exchange = r.get("short_exchange")
            long_exchange = r.get("long_exchange")
            notional = float(r.get("notional") or 0.0)
            if not (symbol and short_exchange and long_exchange and notional > 0):
                continue

            short_order = r.get("short_order") or {}
            long_order = r.get("long_order") or {}
            short_avg = float(short_order.get("average") or short_order.get("price") or 0.0)
            long_avg = float(long_order.get("average") or long_order.get("price") or 0.0)

            if short_avg <= 0 and short_exchange in self.adapters:
                short_avg = float(self.adapters[short_exchange].fetch_ticker(symbol).get("last") or 0.0)
            if long_avg <= 0 and long_exchange in self.adapters:
                long_avg = float(self.adapters[long_exchange].fetch_ticker(symbol).get("last") or 0.0)

            if short_avg <= 0 or long_avg <= 0:
                continue

            self.ledger.open_pair(
                symbol=symbol,
                short_exchange=short_exchange,
                long_exchange=long_exchange,
                notional_usd=notional,
                short_entry_price=short_avg,
                long_entry_price=long_avg,
            )

    def _collect_quotes(self) -> list[FundingQuote]:
        quotes: list[FundingQuote] = []
        for adapter in self.adapters.values():
            quotes.extend(adapter.fetch_funding_quotes(self.symbols))
        return quotes

    def _collect_balances(self) -> dict[str, float]:
        return {name: adapter.fetch_balance_usd() for name, adapter in self.adapters.items()}

    @staticmethod
    def _filled_notional(order: dict, fallback_notional: float) -> float:
        if order is None:
            return fallback_notional
        if order.get("cost") is not None:
            return float(order["cost"])
        filled = order.get("filled")
        avg = order.get("average") or order.get("price")
        if filled is not None and avg is not None:
            return float(filled) * float(avg)
        return fallback_notional

    def close_pair(self, symbol: str, funding_pnl_usd: float = 0.0, fees_usd: float = 0.0):
        # assumes pair is open in ledger
        rec = self.ledger._open.get(symbol)
        if rec is None:
            return RunResult(executed=False, reason="no open position")

        short_adapter = self.adapters[rec.short_exchange]
        long_adapter = self.adapters[rec.long_exchange]

        short_adapter.place_market_order(symbol=symbol, side="buy", notional_usd=rec.notional_usd, reduce_only=True)
        long_adapter.place_market_order(symbol=symbol, side="sell", notional_usd=rec.notional_usd, reduce_only=True)

        short_px = float((short_adapter.fetch_ticker(symbol).get("last") or 0.0))
        long_px = float((long_adapter.fetch_ticker(symbol).get("last") or 0.0))

        summary = self.ledger.close_pair(
            symbol=symbol,
            short_exit_price=short_px,
            long_exit_price=long_px,
            funding_pnl_usd=funding_pnl_usd,
            fees_usd=fees_usd,
        )
        self.store.save_close(summary.__dict__)
        return summary

    def rebalance(self) -> list[dict]:
        if not self.rebalance_targets_usd:
            return []
        balances = self._collect_balances()
        plans = rebalance_transfer_plan(
            balances=balances,
            targets=self.rebalance_targets_usd,
            min_transfer_usd=100.0,
        )
        out = []
        for p in plans:
            row = p.__dict__
            self.store.save_rebalance(row)
            out.append(row)
        return out

    def run_once(self) -> RunResult:
        quotes = self._collect_quotes()
        opps = find_best_opportunities(
            quotes=quotes,
            taker_fee_bps=self.taker_fee_bps,
            slippage_bps=self.slippage_bps,
            min_net_apr=self.min_net_apr,
            top_n=self.top_n,
        )
        self.store.save_opportunities(opps)

        if not opps:
            return RunResult(executed=False, reason="no opportunity")

        best = opps[0]

        if self.ledger.is_open(best.symbol):
            return RunResult(executed=False, reason="position already open", opportunity=best)

        balances = self._collect_balances()
        allowed, reason = self.risk.allow(
            opportunity=best,
            balances=balances,
            open_notional=0.0,
            open_positions=0,
        )
        if not allowed:
            return RunResult(executed=False, reason=reason, opportunity=best)

        if self.dry_run:
            return RunResult(executed=False, reason="dry-run", opportunity=best)

        short_adapter = self.adapters[best.short_exchange]
        long_adapter = self.adapters[best.long_exchange]

        short_order = short_adapter.place_market_order(
            symbol=best.symbol,
            side="sell",
            notional_usd=best.est_trade_notional,
            reduce_only=False,
        )

        try:
            long_order = long_adapter.place_market_order(
                symbol=best.symbol,
                side="buy",
                notional_usd=best.est_trade_notional,
                reduce_only=False,
            )
        except Exception as exc:
            # rollback short leg if hedge leg fails
            try:
                short_adapter.place_market_order(
                    symbol=best.symbol,
                    side="buy",
                    notional_usd=best.est_trade_notional,
                    reduce_only=True,
                )
            finally:
                return RunResult(executed=False, reason=f"execution failed: {exc}", opportunity=best)

        short_filled = self._filled_notional(short_order, best.est_trade_notional)
        long_filled = self._filled_notional(long_order, best.est_trade_notional)
        recon = reconcile_hedge_fills(
            short_filled_usd=short_filled,
            long_filled_usd=long_filled,
            max_slippage_ratio=self.max_fill_mismatch_ratio,
        )

        rehedge_order = None
        if recon.needs_rehedge:
            rehedge_notional = recon.rehedge_notional_usd
            # place rehedge on the underfilled side
            if recon.rehedge_side == "buy":
                rehedge_order = long_adapter.place_market_order(
                    symbol=best.symbol,
                    side="buy",
                    notional_usd=rehedge_notional,
                    reduce_only=False,
                )
            else:
                rehedge_order = long_adapter.place_market_order(
                    symbol=best.symbol,
                    side="sell",
                    notional_usd=rehedge_notional,
                    reduce_only=False,
                )

        short_px = float(short_adapter.fetch_ticker(best.symbol).get("last") or best.est_trade_notional)
        long_px = float(long_adapter.fetch_ticker(best.symbol).get("last") or best.est_trade_notional)
        self.ledger.open_pair(
            symbol=best.symbol,
            short_exchange=best.short_exchange,
            long_exchange=best.long_exchange,
            notional_usd=min(short_filled, long_filled),
            short_entry_price=max(short_px, 1e-9),
            long_entry_price=max(long_px, 1e-9),
        )

        self.store.save_execution(
            {
                "ts": datetime.now(UTC).isoformat(),
                "symbol": best.symbol,
                "short_exchange": best.short_exchange,
                "long_exchange": best.long_exchange,
                "short_order": short_order,
                "long_order": long_order,
                "rehedge_order": rehedge_order,
                "reconcile": recon.__dict__,
                "notional": best.est_trade_notional,
                "short_filled": short_filled,
                "long_filled": long_filled,
                "net_apr": best.net_apr,
            }
        )

        return RunResult(executed=True, reason="executed", opportunity=best)
