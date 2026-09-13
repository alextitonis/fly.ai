from .pegkeeper import Curve

# Pool params
n = 2
CRVUSD_I = 1  # For 0 use (1 - share)
A = 500  # ALTER
fee = int(0.02 * 10 ** 8)  # ALTER: %
usd_amount = 2 * 10 ** 6  # ALTER: each token balance in equilibrium

CALLER_SHARE = 20  # %

# auxiliary
INITIAL_AMOUNT = usd_amount * 10 ** 18
STEPS = 400

PROFIT_BREAKPOINTS = [0, 3, 6, 12, 24, 48]


def get_price(_curve):
    dx = 10 ** 18
    return dx / _curve.dy(CRVUSD_I, 1 - CRVUSD_I, dx, False)


def update(_curve):
    """ Peg Keeper update """
    diff = _curve.x[CRVUSD_I] - _curve.x[1 - CRVUSD_I]
    amount = abs(diff) // 5
    if amount < 10 ** 18:
        return 0, 0, 0
    amounts = [0, 0]
    amounts[CRVUSD_I] = amount
    if diff > 0:
        lp_amount = _curve.remove_liquidity_imbalance(amounts, True)
    else:
        lp_amount = _curve.add_liquidity(amounts, True)

    vp = _curve.get_virtual_price()
    if diff > 0:
        # amount we had - amount needed
        profit = amount * 10 ** 18 // vp - lp_amount
        amount = -amount
    else:
        # amount received - amount needed in future
        profit = lp_amount - amount * 10 ** 18 // vp

    # debt change, full profit, caller profit
    return amount, profit, profit * CALLER_SHARE // 100


def preset_curve(dx):
    curve = Curve(A, 0, n, tokens=0, fee=fee, admin_fee=5 * 10 ** 9)
    curve.add_liquidity([INITIAL_AMOUNT] * n, True)
    if dx != 0:
        i = 0 if dx < 0 else 1
        curve.exchange(i, 1 - i, abs(dx))
    return curve


def find_provide_limit():
    print(f"fee {fee / 10 ** 8:.2f}%")
    profit_breakpoints = PROFIT_BREAKPOINTS
    left_bound, right_bound = 10 ** 18, usd_amount * 10 ** 18 // 2
    for dx in range(left_bound, right_bound, (right_bound - left_bound) // STEPS):
        curve = preset_curve(-dx)

        initial_price = get_price(curve)
        _, _, profit = update(curve)
        profit /= 10 ** 18

        if profit > profit_breakpoints[0]:
            print(f"{profit:.2f} USD profit, "
                  f"{initial_price:.6f} -> {get_price(curve):.6f}")
            if len(profit_breakpoints) == 1:
                break
            profit_breakpoints = profit_breakpoints[1:]


if __name__ == "__main__":
    find_provide_limit()
