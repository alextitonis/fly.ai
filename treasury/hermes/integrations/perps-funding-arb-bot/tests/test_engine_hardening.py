from perps_arb.engine import ArbEngine
from perps_arb.models import FundingQuote
from perps_arb.risk import RiskLimits


class PartialFillAdapter:
   def __init__(self, name, quotes, first_fill, price=60000, balance=2000):
       self.name = name
       self._quotes = quotes
       self.first_fill = first_fill
       self.price = price
       self.balance = balance
       self.orders = []

   def fetch_funding_quotes(self, symbols):
       return [q for q in self._quotes if q.symbol in symbols]

   def fetch_balance_usd(self):
       return self.balance

   def fetch_ticker(self, symbol):
       return {"last": self.price}

   def place_market_order(self, symbol, side, notional_usd, reduce_only=False):
       self.orders.append((symbol, side, notional_usd, reduce_only))
       # only first order is partial-filled footprint
       if len(self.orders) == 1:
           return {"id": f"{self.name}-1", "cost": self.first_fill}
       return {"id": f"{self.name}-{len(self.orders)}", "cost": notional_usd}


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


def test_engine_reconciles_partial_fill_and_rehedges():
   dex_alpha = PartialFillAdapter(
       "dex_alpha",
       [FundingQuote(exchange="dex_alpha", symbol="BTC/USDT:USDT", funding_rate=0.0005, funding_interval_hours=8, mark_price=60000)],
       first_fill=1000,
       price=60000,
   )
   dex_beta = PartialFillAdapter(
       "dex_beta",
       [FundingQuote(exchange="dex_beta", symbol="BTC/USDT:USDT", funding_rate=-0.0002, funding_interval_hours=8, mark_price=60010)],
       first_fill=700,
       price=60010,
   )
   store = Store()

   engine = ArbEngine(
       adapters={"dex_alpha": dex_alpha, "dex_beta": dex_beta},
       symbols=["BTC/USDT:USDT"],
       risk_limits=RiskLimits(max_notional_per_trade=2000, max_total_notional=10000, max_open_positions=5, max_delta_usd=100),
       taker_fee_bps=4,
       slippage_bps=1,
       min_net_apr=0.01,
       dry_run=False,
       store=store,
       max_fill_mismatch_ratio=0.05,
   )

   result = engine.run_once()

   assert result.executed is True
   # at least one extra order due to re-hedge
   assert len(dex_beta.orders) >= 2
   assert store.execs
   assert store.execs[-1]["reconcile"]["needs_rehedge"] is True


def test_engine_close_and_rebalance_flow():
   dex_alpha = PartialFillAdapter(
       "dex_alpha",
       [FundingQuote(exchange="dex_alpha", symbol="ETH/USDT:USDT", funding_rate=0.0004, funding_interval_hours=8, mark_price=3000)],
       first_fill=1000,
       price=2950,
       balance=2500,
   )
   dex_beta = PartialFillAdapter(
       "dex_beta",
       [FundingQuote(exchange="dex_beta", symbol="ETH/USDT:USDT", funding_rate=-0.0002, funding_interval_hours=8, mark_price=3010)],
       first_fill=1000,
       price=3050,
       balance=500,
   )
   store = Store()

   engine = ArbEngine(
       adapters={"dex_alpha": dex_alpha, "dex_beta": dex_beta},
       symbols=["ETH/USDT:USDT"],
       risk_limits=RiskLimits(max_notional_per_trade=2000, max_total_notional=10000, max_open_positions=5, max_delta_usd=100),
       taker_fee_bps=4,
       slippage_bps=1,
       min_net_apr=0.01,
       dry_run=False,
       store=store,
       rebalance_targets_usd={"dex_alpha": 1500, "dex_beta": 1500},
   )

   engine.run_once()
   close_summary = engine.close_pair("ETH/USDT:USDT", funding_pnl_usd=5.0, fees_usd=1.0)

   assert close_summary is not None
   assert close_summary.funding_pnl_usd == 5.0
   assert store.closes

   plans = engine.rebalance()
   assert plans
   assert plans[0]["source_exchange"] == "dex_alpha"
   assert plans[0]["destination_exchange"] == "dex_beta"
   assert store.rebalances
