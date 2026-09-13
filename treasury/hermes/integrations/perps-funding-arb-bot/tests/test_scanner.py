from perps_arb.models import FundingQuote
from perps_arb.scanner import find_best_opportunities


def test_find_best_opportunities_accounts_for_fees_and_interval():
   quotes = [
       FundingQuote(exchange="dex_alpha", symbol="BTC/USDT:USDT", funding_rate=0.0003, funding_interval_hours=8, mark_price=60000.0),
       FundingQuote(exchange="dex_beta", symbol="BTC/USDT:USDT", funding_rate=-0.0001, funding_interval_hours=8, mark_price=60010.0),
       FundingQuote(exchange="dex_gamma", symbol="BTC/USDT:USDT", funding_rate=0.00005, funding_interval_hours=8, mark_price=60005.0),
   ]

   opportunities = find_best_opportunities(
       quotes=quotes,
       taker_fee_bps=4.0,
       slippage_bps=1.0,
       min_net_apr=0.05,
       top_n=5,
   )

   assert len(opportunities) == 1
   best = opportunities[0]
   assert best.symbol == "BTC/USDT:USDT"
   assert best.short_exchange == "dex_alpha"
   assert best.long_exchange == "dex_beta"
   assert best.net_apr > 0.05
