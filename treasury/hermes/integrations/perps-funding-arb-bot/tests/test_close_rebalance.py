from perps_arb.close_rebalance import rebalance_transfer_plan


def test_rebalance_transfer_plan_moves_from_surplus_to_deficit():
   balances = {"dex_alpha": 2500.0, "dex_beta": 500.0}
   targets = {"dex_alpha": 1500.0, "dex_beta": 1500.0}

   plan = rebalance_transfer_plan(balances, targets, min_transfer_usd=100)

   assert len(plan) == 1
   t = plan[0]
   assert t.source_exchange == "dex_alpha"
   assert t.destination_exchange == "dex_beta"
   assert t.amount_usd == 1000.0
