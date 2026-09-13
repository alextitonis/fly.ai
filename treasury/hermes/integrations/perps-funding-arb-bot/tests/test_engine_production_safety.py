from perps_arb.engine import ArbEngine
from perps_arb.models import FundingQuote
from perps_arb.risk import RiskLimits


class FlakyAdapter:
    def __init__(self, name, quotes, fail_on_order_num=None):
        self.name = name
        self._quotes = quotes
        self.fail_on_order_num = fail_on_order_num
        self.orders = []

    def fetch_funding_quotes(self, symbols):
        return [q for q in self._quotes if q.symbol in symbols]

    def fetch_balance_usd(self):
        return 10000.0

    def fetch_ticker(self, symbol):
        return {"last": 50000.0}

    def place_market_order(self, symbol, side, notional_usd, reduce_only=False):
        n = len(self.orders) + 1
        if self.fail_on_order_num == n:
            raise RuntimeError(f"{self.name} order failed")
        self.orders.append((symbol, side, notional_usd, reduce_only))
        return {"id": f"{self.name}-{n}", "cost": notional_usd}


class Store:
    def __init__(self):
        self.execs = []
        self.closes = []
        self.rebalances = []

    def save_opportunities(self, opportunities):
        self.opps = opportunities

    def save_execution(self, record):
        self.execs.append(record)

    def save_close(self, record):
        self.closes.append(record)

    def save_rebalance(self, record):
        self.rebalances.append(record)


def _build_engine(short_adapter, long_adapter):
    return ArbEngine(
        adapters={"dex_a": short_adapter, "dex_b": long_adapter},
        symbols=["BTC/USDT:USDT"],
        risk_limits=RiskLimits(
            max_notional_per_trade=2000,
            max_total_notional=10000,
            max_open_positions=5,
            max_delta_usd=100,
        ),
        taker_fee_bps=4,
        slippage_bps=1,
        min_net_apr=0.01,
        dry_run=False,
        store=Store(),
    )


def test_run_once_skips_symbol_when_position_already_open():
    short = FlakyAdapter(
        "dex_a",
        [FundingQuote(exchange="dex_a", symbol="BTC/USDT:USDT", funding_rate=0.0005, funding_interval_hours=8, mark_price=50000)],
    )
    long = FlakyAdapter(
        "dex_b",
        [FundingQuote(exchange="dex_b", symbol="BTC/USDT:USDT", funding_rate=-0.0002, funding_interval_hours=8, mark_price=50000)],
    )
    engine = _build_engine(short, long)

    first = engine.run_once()
    assert first.executed is True

    second = engine.run_once()
    assert second.executed is False
    assert second.reason == "position already open"


def test_run_once_rolls_back_short_if_long_leg_fails():
    short = FlakyAdapter(
        "dex_a",
        [FundingQuote(exchange="dex_a", symbol="BTC/USDT:USDT", funding_rate=0.0005, funding_interval_hours=8, mark_price=50000)],
    )
    # fail first order on long venue
    long = FlakyAdapter(
        "dex_b",
        [FundingQuote(exchange="dex_b", symbol="BTC/USDT:USDT", funding_rate=-0.0002, funding_interval_hours=8, mark_price=50000)],
        fail_on_order_num=1,
    )
    engine = _build_engine(short, long)

    result = engine.run_once()

    assert result.executed is False
    assert result.reason.startswith("execution failed")
    # first short opens
    assert short.orders[0][1] == "sell"
    # second short order should be rollback close (buy reduce_only)
    assert short.orders[1][1] == "buy"
    assert short.orders[1][3] is True
