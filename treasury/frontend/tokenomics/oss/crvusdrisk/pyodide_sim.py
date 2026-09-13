"""
Python port of crvUSD risk model agents, adapted for Pyodide/WASM.
Original: xenophonlabs/crvUSDrisk (MIT license).

The original repo depends on crvusdsim, curvesim, scipy, and sklearn —
none available in Pyodide. This port captures the agent-based stress
testing logic (arbitrage, liquidation, keeper, borrower, LP) using
the Curve pool math from oss.curve.pegkeeper and the stablecoin
dynamics from oss.stablecoin.dynamics.
"""

import numpy as np
from collections import defaultdict
from oss.curve.pegkeeper import Curve
from oss.stablecoin.dynamics import simulate_step
from oss.stablecoin.parameters import SystemParameters


class Agent:
    """Base agent class — ported from crvusdrisk/agent.py."""

    def __init__(self):
        self._profit = defaultdict(float)
        self._count = defaultdict(int)
        self._borrower_loss = 0.0

    def profit(self, address=None):
        if not address:
            return sum(self._profit.values())
        return self._profit[address]

    def count(self, address=None):
        if not address:
            return sum(self._count.values())
        return self._count[address]

    @property
    def borrower_loss(self):
        return self._borrower_loss

    @property
    def name(self):
        return type(self).__name__


class Keeper(Agent):
    """Ported from crvusdrisk/keeper.py — calls PegKeeper update when profitable."""

    def __init__(self, tolerance=0):
        super().__init__()
        self.tolerance = tolerance

    def update(self, pool, crvusd_i=1):
        diff = pool.x[crvusd_i] - pool.x[1 - crvusd_i]
        amount = abs(diff) // 5
        if amount < 10 ** 18:
            return 0, 0

        amounts = [0, 0]
        amounts[crvusd_i] = amount
        if diff > 0:
            lp_amount = pool.remove_liquidity_imbalance(amounts, True)
        else:
            lp_amount = pool.add_liquidity(amounts, True)

        vp = pool.get_virtual_price()
        if diff > 0:
            profit = amount * 10 ** 18 // vp - lp_amount
            amount = -amount
        else:
            profit = lp_amount - amount * 10 ** 18 // vp

        if profit > self.tolerance:
            self._profit["pegkeeper"] += profit / 1e18
            self._count["pegkeeper"] += 1

        return amount, profit / 1e18


class Arbitrageur(Agent):
    """Ported from crvusdrisk/arbitrageur.py — cyclic arbitrage between pools."""

    def __init__(self, tolerance=1.0):
        super().__init__()
        self.tolerance = tolerance

    def arbitrage(self, pool, external_price, crvusd_i=1):
        dx = 10 ** 18
        try:
            pool_price = dx / pool.dy(crvusd_i, 1 - crvusd_i, dx, False)
        except Exception:
            return 0

        if external_price > pool_price:
            trade_amount = min(pool.x[1 - crvusd_i] // 2, int(1e22))
            if trade_amount > 0:
                try:
                    out = pool.exchange(1 - crvusd_i, crvusd_i, trade_amount)
                    profit = (out / 1e18) * (external_price - pool_price)
                    if profit > self.tolerance:
                        self._profit["arb"] += profit
                        self._count["arb"] += 1
                        return profit
                except Exception:
                    pass
        elif external_price < pool_price:
            trade_amount = min(pool.x[crvusd_i] // 2, int(1e22))
            if trade_amount > 0:
                try:
                    out = pool.exchange(crvusd_i, 1 - crvusd_i, trade_amount)
                    profit = (out / 1e18) * (pool_price - external_price)
                    if profit > self.tolerance:
                        self._profit["arb"] += profit
                        self._count["arb"] += 1
                        return profit
                except Exception:
                    pass
        return 0


class Liquidator(Agent):
    """Ported from crvusdrisk/liquidator.py — liquidates undercollateralized positions."""

    def __init__(self, tolerance=0):
        super().__init__()
        self.tolerance = tolerance
        self.collateral_liquidated = defaultdict(float)
        self.debt_repaid = defaultdict(float)

    def liquidate(self, trove_manager, trove_id, external_price):
        try:
            icr = trove_manager.get_current_icr(trove_id, external_price)
        except Exception:
            return False

        if icr >= trove_manager.MCR:
            return False

        trove = trove_manager.troves.get(trove_id)
        if trove is None:
            return False

        debt = trove.debt
        coll = trove.coll
        profit = coll * external_price - debt

        if profit > self.tolerance:
            self._profit["liquidation"] += profit
            self._count["liquidation"] += 1
            self.collateral_liquidated["all"] += coll
            self.debt_repaid["all"] += debt
            self._borrower_loss += max(0, debt - coll * external_price)
            return True
        return False


class Borrower(Agent):
    """Ported from crvusdrisk/borrower.py — creates/repays loans."""

    def __init__(self):
        super().__init__()
        self.collateral = 0
        self.debt = 0

    def create_loan(self, trove_manager, owner, collateral, debt, interest_rate):
        try:
            price = trove_manager.price_feed.fetch_price()
            if (collateral * price) / debt < trove_manager.MCR:
                return False
            trove_manager.troves[owner] = type(
                'Trove', (), {
                    'debt': debt, 'coll': collateral,
                    'status': type('S', (), {'name': 'ACTIVE'})(),
                }
            )()
            self.collateral = collateral
            self.debt = debt
            return True
        except Exception:
            return False


class LiquidityProvider(Agent):
    """Ported from crvusdrisk/liquidity_provider.py — adds/removes liquidity."""

    def __init__(self):
        super().__init__()

    def add_liquidity(self, pool, amounts):
        try:
            pool.add_liquidity(amounts, True)
            self._count["lp"] += 1
        except Exception:
            pass


class StressScenario:
    """
    Agent-based stress test using the crvUSD risk model pattern.
    Combines Curve pool math, stablecoin dynamics, and agent interactions.
    """

    def __init__(self, initial_supply=1e6, initial_collateral=1.5e6,
                 initial_liquidity=1e6, pool_a=500, pool_fee=2000000):
        self.params = SystemParameters(
            initial_supply=initial_supply,
            initial_collateral=initial_collateral,
            initial_liquidity=initial_liquidity,
            initial_demand=initial_supply,
        )
        self.state = (initial_supply, 1.0, initial_collateral,
                      initial_liquidity, initial_supply)

        n = 2
        initial_amount = int(initial_liquidity * 1e18)
        self.pool = Curve(pool_a, 0, n, tokens=0, fee=pool_fee, admin_fee=5 * 10 ** 9)
        self.pool.add_liquidity([initial_amount] * n, True)

        self.keeper = Keeper()
        self.arbitrageur = Arbitrageur()
        self.liquidator = Liquidator()
        self.borrower = Borrower()
        self.lp = LiquidityProvider()

        self.history = {
            'supply': [], 'price': [], 'collateral': [],
            'liquidity': [], 'demand': [],
            'keeper_profit': [], 'arb_profit': [], 'liq_count': [],
        }

    def step(self, collateral_shock=0.0, liquidity_shock=0.0, external_price=1.0):
        S, P, C, L, D = self.state

        C_new = C * (1.0 + collateral_shock)
        L_new = L * (1.0 + liquidity_shock)

        self.state = simulate_step(
            (S, P, C_new, L_new, D), self.params
        )
        S_new, P_new, C_new2, L_new2, D_new = self.state

        self.keeper.update(self.pool)
        self.arbitrageur.arbitrage(self.pool, external_price)

        self.history['supply'].append(S_new)
        self.history['price'].append(P_new)
        self.history['collateral'].append(C_new2)
        self.history['liquidity'].append(L_new2)
        self.history['demand'].append(D_new)
        self.history['keeper_profit'].append(self.keeper.profit())
        self.history['arb_profit'].append(self.arbitrageur.profit())
        self.history['liq_count'].append(self.liquidator.count())

        return {
            'supply': S_new, 'price': P_new, 'collateral': C_new2,
            'liquidity': L_new2, 'demand': D_new,
            'peg_deviation': abs(P_new - 1.0),
            'keeper_profit': self.keeper.profit(),
            'arb_profit': self.arbitrageur.profit(),
            'liquidation_count': self.liquidator.count(),
            'tcr': C_new2 / S_new if S_new > 0 else 0,
        }

    def get_state(self):
        S, P, C, L, D = self.state
        return {
            'supply': S, 'price': P, 'collateral': C,
            'liquidity': L, 'demand': D,
            'tcr': C / S if S > 0 else 0,
            'peg_deviation': abs(P - 1.0),
        }
