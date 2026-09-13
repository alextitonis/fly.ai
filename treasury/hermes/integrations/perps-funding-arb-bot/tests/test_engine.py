from perps_arb.engine import ArbEngine
from perps_arb.models import FundingQuote
from perps_arb.risk import RiskLimits


class FakeAdapter:
   def __init__(self, name, quotes, price=60000):
       self.name = name
       self._quotes = quotes
       self.orders = []
       self.price = price

   def fetch_funding_quotes(self, symbols):
       return [q for q in self._quotes if q.symbol in symbols]

   def fetch_balance_usd(self):
       return 10000.0

   def fetch_ticker(self, symbol):
       return {"last": self.price}

   def place_market_order(self, symbol, side, notional_usd, reduce_only=False):
       self.orders.append((symbol, side, notional_usd, reduce_only))
       return {"id": f"{self.name}-{len(self.orders)}", "cost": notional_usd}


class NullStore:
   def save_opportunities(self, opportunities):
       self.last_opps = opportunities

   def save_execution(self, record):
       self.last_exec = record

   def save_close(self, record):
       self.last_close = record

   def save_rebalance(self, record):
       self.last_rebalance = record


def test_engine_executes_hedged_pair():
   dex_alpha = FakeAdapter("dex_alpha", [
       FundingQuote(exchange="dex_alpha", symbol="BTC/USDT:USDT", funding_rate=0.00035, funding_interval_hours=8, mark_price=60000),
   ])
   dex_beta = FakeAdapter("dex_beta", [
       FundingQuote(exchange="dex_beta", symbol="BTC/USDT:USDT", funding_rate=-0.00015, funding_interval_hours=8, mark_price=60020),
   ])

   engine = ArbEngine(
       adapters={"dex_alpha": dex_alpha, "dex_beta": dex_beta},
       symbols=["BTC/USDT:USDT"],
       risk_limits=RiskLimits(max_notional_per_trade=2000, max_total_notional=8000, max_open_positions=5, max_delta_usd=50),
       taker_fee_bps=4,
       slippage_bps=1,
       min_net_apr=0.01,
       dry_run=False,
       store=NullStore(),
   )

   result = engine.run_once()

   assert result.executed is True
   assert len(dex_alpha.orders) == 1
   assert len(dex_beta.orders) == 1
   assert dex_alpha.orders[0][1] == "sell"
   assert dex_beta.orders[0][1] == "buy"
