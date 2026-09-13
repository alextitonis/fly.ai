from perps_arb.models import Opportunity
from perps_arb.risk import RiskManager, RiskLimits


def test_risk_manager_blocks_if_delta_too_large():
   limits = RiskLimits(max_notional_per_trade=5000, max_total_notional=10000, max_open_positions=3, max_delta_usd=15)
   manager = RiskManager(limits)

   opp = Opportunity(
       symbol="ETH/USDT:USDT",
       short_exchange="dex_alpha",
       long_exchange="dex_beta",
       short_rate=0.0005,
       long_rate=-0.0002,
       gross_apr=0.31,
       net_apr=0.22,
       est_trade_notional=1000,
       est_delta_usd=50,
   )

   allowed, reason = manager.allow(
       opportunity=opp,
       balances={"dex_alpha": 2000, "dex_beta": 2000},
       open_notional=0,
       open_positions=0,
   )

   assert allowed is False
   assert "delta" in reason.lower()
