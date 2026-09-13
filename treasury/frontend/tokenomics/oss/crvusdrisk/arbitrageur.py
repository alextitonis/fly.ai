"""Provides the `Arbitrageur` class."""
from typing import List, Tuple, cast
import math
from .agent import Agent
from ..trades import Cycle, Swap
from ..trades.cycle import _optimize_mem
from ..prices import PriceSample
from ..configs import DEFAULT_PROFIT_TOLERANCE
from ..logging import (
    get_logger,
)

PRECISION = 1e18

logger = get_logger(__name__)


class Arbitrageur(Agent):
    """
    Arbitrageur performs cyclic arbitrages between the following
    Curve pools:
        - StableSwap pools
        - LLAMMAs.
    """

    def __init__(self, tolerance: float = DEFAULT_PROFIT_TOLERANCE):
        super().__init__()
        assert tolerance > 0  # default is one dollah
        self.tolerance: float = tolerance

    def arbitrage(self, cycles: List[Cycle], prices: PriceSample) -> None:
        """
        Identify optimal arbitrages involving crvusd of the form:

            crvusd pool -> crvusd pool -> External Market

        LLAMMA Example: WETH/crvusd -> USDC/crvusd -> USDC/WETH
        StableSwap Example: USDC/crvusd -> USDT/crvusd -> USDT/USDC

        Updates Arbitrageur state.

        Parameters
        ----------
        cycles : List[Cycle]
            List of cycles. Cycles are an ordered list of `Trade`s.
        prices : PriceSample
            Current USD market prices for each coin.
        """
        while True:
            best_cycle, best_profit = self.find_best_arbitrage(cycles, prices)

            if best_cycle and best_profit > self.tolerance:
                logger.debug("Executing arbitrage: %s.", best_cycle)
                # Dollarize profit
                _profit = (
                    best_cycle.execute() * prices.prices_usd[best_cycle.basis_address]
                )
                assert _profit == best_profit, RuntimeError(
                    "Expected profit %f != actual profit %f.", best_profit, _profit
                )

                # Update state
                self._profit["all"] += _profit
                self._count["all"] += 1

                self.update_borrower_losses(best_cycle, prices)

            else:
                logger.debug("No more profitable arbitrages.")
                break

        logger.debug("Cache info: %s", _optimize_mem.cache_info())

    # pylint: disable=too-many-locals
    def find_best_arbitrage(
        self, cycles: List[Cycle], prices: PriceSample
    ) -> Tuple[Cycle | None, float]:
        """
        Find the optimal liquidity-constrained cyclic arbitrages.
        Dollarize the profit by marking it to current USD market price.

        Parameters
        ----------
        cycles : List[Cycle]
            List of cycles. Cycles are an ordered list of `Trade`s.
        prices : PriceSample
            Current USD market prices for each coin.
        multiprocess : bool, default=True
            Whether to use multiprocessing to find the optimal cycle.
            Default is True.

        Returns
        -------
        best_cycle : Cycle
            The optimal cycle.
        best_profit : float
            The dollarized profit of the optimal cycle.
        """
        best_profit = -math.inf
        best_amt = 0
        best_cycle = None
        for cycle in cycles:
            # Get 1 dollar's worth (marked to market)
            trade = cast(Swap, cycle.trades[0])
            decimals = trade.get_decimals(trade.i)
            xatol = int(10**decimals / prices.prices_usd[cycle.basis_address])

            amt, profit = cycle.optimize(xatol=xatol)

            # Dollarize the expected profit
            profit *= prices.prices_usd[cycle.basis_address]

            if profit > best_profit:
                best_cycle = cycle
                best_profit = profit
                best_amt = amt

        if best_cycle:
            best_cycle.populate(best_amt, use_snapshot_context=False)

        return best_cycle, best_profit
