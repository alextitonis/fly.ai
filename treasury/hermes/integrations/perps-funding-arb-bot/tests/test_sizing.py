from perps_arb.sizing import MarketMeta, SizeCalculator


def test_size_calculator_rounds_down_to_step_and_min_notional():
    calc = SizeCalculator()
    meta = MarketMeta(min_amount=0.001, amount_step=0.001, min_notional=10)

    amount = calc.amount_for_notional(notional_usd=123.45, price=42000, market=meta)

    # raw=0.002939..., floor to 0.002
    assert amount == 0.002


def test_size_calculator_returns_zero_if_below_min_notional_after_rounding():
    calc = SizeCalculator()
    meta = MarketMeta(min_amount=0.001, amount_step=0.001, min_notional=100)

    amount = calc.amount_for_notional(notional_usd=20, price=30000, market=meta)

    assert amount == 0.0
