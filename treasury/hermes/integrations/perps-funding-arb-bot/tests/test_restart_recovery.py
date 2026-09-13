from perps_arb.engine import ArbEngine
from perps_arb.models import FundingQuote
from perps_arb.risk import RiskLimits
from perps_arb.store import JsonlStateStore


class SimpleAdapter:
    def __init__(self, name, quotes, price=50000.0):
        self.name = name
        self._quotes = quotes
        self.price = price
        self.orders = []

    def fetch_funding_quotes(self, symbols):
        return [q for q in self._quotes if q.symbol in symbols]

    def fetch_balance_usd(self):
        return 10000.0

    def fetch_ticker(self, symbol):
        return {"last": self.price}

    def place_market_order(self, symbol, side, notional_usd, reduce_only=False):
        self.orders.append((symbol, side, notional_usd, reduce_only))
        return {"id": f"{self.name}-{len(self.orders)}", "cost": notional_usd}


def _build_engine(store, a, b):
    return ArbEngine(
        adapters={"dex_a": a, "dex_b": b},
        symbols=["BTC/USDT:USDT"],
        risk_limits=RiskLimits(max_notional_per_trade=2000, max_total_notional=10000, max_open_positions=5, max_delta_usd=100),
        taker_fee_bps=4,
        slippage_bps=1,
        min_net_apr=0.01,
        dry_run=False,
        store=store,
    )


def test_engine_recovers_open_positions_from_store_on_restart(tmp_path):
    store = JsonlStateStore(base_dir=str(tmp_path / "data"))
    a1 = SimpleAdapter("dex_a", [FundingQuote(exchange="dex_a", symbol="BTC/USDT:USDT", funding_rate=0.0005, funding_interval_hours=8, mark_price=50000)])
    b1 = SimpleAdapter("dex_b", [FundingQuote(exchange="dex_b", symbol="BTC/USDT:USDT", funding_rate=-0.0002, funding_interval_hours=8, mark_price=50000)])

    engine1 = _build_engine(store, a1, b1)
    first = engine1.run_once()
    assert first.executed is True

    # simulate restart with fresh adapters/engine but same persisted store
    a2 = SimpleAdapter("dex_a", [FundingQuote(exchange="dex_a", symbol="BTC/USDT:USDT", funding_rate=0.0006, funding_interval_hours=8, mark_price=50000)])
    b2 = SimpleAdapter("dex_b", [FundingQuote(exchange="dex_b", symbol="BTC/USDT:USDT", funding_rate=-0.0001, funding_interval_hours=8, mark_price=50000)])
    engine2 = _build_engine(store, a2, b2)

    second = engine2.run_once()
    assert second.executed is False
    assert second.reason == "position already open"


def test_restart_recovery_ignores_closed_positions(tmp_path):
    store = JsonlStateStore(base_dir=str(tmp_path / "data"))
    a = SimpleAdapter("dex_a", [FundingQuote(exchange="dex_a", symbol="BTC/USDT:USDT", funding_rate=0.0005, funding_interval_hours=8, mark_price=50000)])
    b = SimpleAdapter("dex_b", [FundingQuote(exchange="dex_b", symbol="BTC/USDT:USDT", funding_rate=-0.0002, funding_interval_hours=8, mark_price=50000)])
    engine = _build_engine(store, a, b)

    assert engine.run_once().executed is True
    close_result = engine.close_pair("BTC/USDT:USDT")
    assert close_result is not None

    restarted = _build_engine(store, a, b)
    result = restarted.run_once()
    assert result.executed is True
