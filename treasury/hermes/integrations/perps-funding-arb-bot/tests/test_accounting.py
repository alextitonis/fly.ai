from perps_arb.accounting import PositionLedger


def test_position_ledger_tracks_open_close_and_pnl_with_funding():
   ledger = PositionLedger()
   ledger.open_pair(
       symbol="BTC/USDT:USDT",
       short_exchange="dex_alpha",
       long_exchange="dex_beta",
       notional_usd=1000,
       short_entry_price=50000,
       long_entry_price=50000,
   )

   summary = ledger.close_pair(
       symbol="BTC/USDT:USDT",
       short_exit_price=49500,
       long_exit_price=50500,
       funding_pnl_usd=12.5,
       fees_usd=3.5,
   )

   assert summary.realized_pnl_usd > 0
   assert summary.funding_pnl_usd == 12.5
   assert summary.fees_usd == 3.5
