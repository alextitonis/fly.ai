"""
Provides the `Cycle` class for optimizing and
exeucuting a sequence of trades.
"""
import math
from typing import Sequence, cast, Dict, Any, Tuple, List
from functools import lru_cache, cached_property
from scipy.optimize import minimize_scalar
from crvusdsim.pool import SimLLAMMAPool, SimCurveStableSwapPool
from curvesim.pool import SimCurvePool
from .trade import Swap, Liquidation
from ..logging import get_logger
from ..modules import ExternalMarket

TOLERANCE = 1e-4

logger = get_logger(__name__)


class Cycle:
    """
    The `Cycle` class represents a sequence of trades that
    satisfy the following conditions:
    1. The output token of each trade is the input token of
    the next trade, including the first/last trades.
    2. The output amount from each trade is equal to the input
    amount of the next trade, except for the first/last trades.

    A `Cycle` can include both `Swap` and `Liquidation` trades.
    """

    def __init__(
        self,
        trades: Sequence[Swap | Liquidation],
        expected_profit: float | None = None,
    ):
        self.trades = trades
        self.n: int = len(trades)
        self.expected_profit = expected_profit
        self.basis_address: str = trades[0].get_address(trades[0].i)
        self.state_key: StateKey = StateKey(self)  # for memoization
        self.oracles = []

        for trade in trades:
            # Get any oracles
            if isinstance(trade, Swap) and hasattr(trade.pool, "price_oracle_contract"):
                self.oracles.append(trade.pool.price_oracle_contract)
            elif isinstance(trade, Liquidation):
                self.oracles.append(trade.controller.AMM.price_oracle_contract)

    @cached_property
    def llamma_trades(self) -> List[int]:
        """Get indices of swaps involving LLAMMAs."""
        trades = []
        for i, trade in enumerate(self.trades):
            if isinstance(trade, Swap) and isinstance(trade.pool, SimLLAMMAPool):
                trades.append(i)
            elif isinstance(trade, Liquidation):
                trades.append(i)
        return trades

    def freeze_oracles(self) -> None:
        """
        Freeze oracle prices.

        FIXME hack to prevent oracle price from changing
        between trades since we don't account for this at
        optimization
        """
        for oracle in self.oracles:
            oracle.price_w()  # Ensure we use updated prices
            oracle.freeze()

    def unfreeze_oracles(self) -> None:
        """
        Unfreeze oracle prices and write latest prices.
        """
        for oracle in self.oracles:
            oracle.unfreeze()
            oracle.price_w()  # Ensure trade updates prices

    def execute(self) -> float:
        """Execute trades."""
        logger.debug("Executing cycle %s.", self)

        self.freeze_oracles()

        trade = self.trades[0]
        amt_in = trade.amt
        amt = amt_in

        for i, trade in enumerate(self.trades):
            amt_out, decimals = trade.execute(amt, use_snapshot_context=False)
            logger.debug("Executed trade %s. Amt out: %d", trade, amt_out)
            if i != self.n - 1:
                amt = amt_out

        profit = (amt_out - amt_in) / 10**decimals

        self.unfreeze_oracles()

        return profit

    def optimize(self, xatol: int | None = None) -> Tuple[int, float]:
        """
        Optimize the `amt_in` for the first trade in the cycle.
        """
        self.freeze_oracles()  # Freeze for performance reasons (avoid recomputing)
        res = _optimize_mem(self.state_key, xatol=xatol)
        self.unfreeze_oracles()
        return res

    def populate(self, amt_in: float | int, use_snapshot_context: bool = True) -> float:
        """
        Populate the amt_in to all trades in cycle, and the expected_profit.

        Parameters
        ----------
        amt_in : float | int
            The amount of the first trade in the cycle.

        Returns
        -------
        expected_profit : float
            The expected profit of the cycle.
        """
        if amt_in < 0:
            return -math.inf

        amt_in = int(amt_in)  # cast float to int
        amt = amt_in
        trade = self.trades[0]

        if not use_snapshot_context:
            trade.amt = amt_in

        for i, trade in enumerate(self.trades):
            amt_out, decimals = trade.execute(amt, use_snapshot_context=True)
            if i != self.n - 1:
                amt = amt_out
                if not use_snapshot_context:
                    self.trades[i + 1].amt = amt

        expected_profit = (amt_out - amt_in) / 10**decimals

        if not use_snapshot_context:
            self.expected_profit = expected_profit

        return expected_profit

    def __repr__(self) -> str:
        return f"Cycle(Trades: {self.trades}, Expected Profit: {self.expected_profit})"


# pylint: disable=too-few-public-methods
class StateKey:
    """
    Get the hash key for LRU cache.

    Note
    ----
    We don't want to get `amt` for trade since this
    is the quantity that gets populated by optimize.
    Similarly, we don't want to use the cycle's
    `expected_profit`.

    It is crucial that whatever goes into the `state_key`
    provides a complete picture of the pool we are trading on.
    If any component of the pool which affects trade execution
    has changed, this MUST invalidate the cache!
    """

    def __init__(self, cycle: Cycle):
        self.cycle = cycle

    def __hash__(self) -> int:
        trades = self.cycle.trades
        hashes = []
        for trade in trades:
            if isinstance(trade, Swap):
                pool = trade.pool
                if isinstance(pool, ExternalMarket):
                    coins_hash = hash(tuple(hash(coin) for coin in pool.coins))
                    if not pool.prices:
                        prices_hash = hash(pool.prices)
                    else:
                        # convert nested dict into hashable tuple
                        prices_hash = hash(
                            tuple(
                                sorted(
                                    {
                                        key: tuple(sorted(pj.items()))
                                        for key, pj in pool.prices.items()
                                    }.items()
                                )
                            )
                        )
                    pool_hash = hash((coins_hash, pool.n, prices_hash))
                elif isinstance(pool, SimLLAMMAPool):
                    pool_hash = hash(
                        (
                            pool.address,
                            pool.active_band,
                            pool.old_p_o,  # TODO is this updated?
                            tuple(pool.bands_x.items()),
                            tuple(pool.bands_y.items()),
                            pool.price_oracle_contract.price(),
                            pool.price_oracle_contract.price_w(),
                        )
                    )
                elif isinstance(pool, (SimCurveStableSwapPool, SimCurvePool)):
                    pool_hash = hash(
                        (
                            pool.address,
                            tuple(pool.balances),
                        )
                    )
                else:
                    raise NotImplementedError(f"Pool type {type(pool)} not supported.")
                hashes.append(pool_hash)
            elif isinstance(trade, Liquidation):
                # controller_hash = hash((
                #     trade.controller.AMM.address,
                #     trade,
                # ))
                # hashes.append(controller_hash)
                raise NotImplementedError(
                    "Liquidation not supported in optimization."
                )  # TODO
        return hash(tuple(hashes))


@lru_cache(maxsize=100)
def _optimize_mem(state_key: StateKey, xatol: int | None = None) -> Tuple[int, float]:
    """
    Memoized optimization for the `amt_in` for the
    first trade in the cycle.

    We set the `xatol` parameter for the minimization. This
    provides a massive speed up. We set the absolute tolerance
    to $1 in the token being traded based on current market price.
    We use the `bounded` method because it allows us to specify
    absolute rather than relative tolerances. Furthermore, we
    have found `bounded` to perform much faster than `brent`
    for our use case.

    Note
    ----
    All trades in `Cycle` MUST BE of type `Swap`.
    """
    cycle = state_key.cycle
    trades = cast(Sequence[Swap], cycle.trades)
    trade = trades[0]
    low = 0
    high = float(trade.pool.get_max_trade_size(trade.i, trade.j))

    if high == 0:
        logger.debug("No liquidity for %s.", str(cycle))
        return 0, 0.0

    kwargs: Dict[str, Any] = {
        "args": (),
        "bounds": (low, high),
        "method": "bounded",
    }

    if xatol:
        kwargs["options"] = {"xatol": xatol}

    res = minimize_scalar(lambda x: -cycle.populate(x), **kwargs)

    if res.success:
        return int(res.x), -res.fun
    raise RuntimeError(res.message)
