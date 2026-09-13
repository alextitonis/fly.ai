from perps_arb.reconcile import ReconcileResult, reconcile_hedge_fills


def test_reconcile_requires_rehedge_when_fill_mismatch_large():
    result = reconcile_hedge_fills(short_filled_usd=900, long_filled_usd=600, max_slippage_ratio=0.05)

    assert isinstance(result, ReconcileResult)
    assert result.needs_rehedge is True
    assert result.rehedge_side in {"buy", "sell"}
    assert result.rehedge_notional_usd > 0


def test_reconcile_accepts_balanced_fills():
    result = reconcile_hedge_fills(short_filled_usd=1000, long_filled_usd=980, max_slippage_ratio=0.05)

    assert result.needs_rehedge is False
    assert result.rehedge_notional_usd == 0
