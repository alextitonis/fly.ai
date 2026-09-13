"""
Provides the `Swap` and `Liquidation` classes,
as well as the `Trade` interface.
"""

from abc import ABC
from typing import Tuple, cast, Any
from contextlib import nullcontext
from dataclasses import dataclass
from curvesim.pool.sim_interface import SimCurvePool
from crvusdsim.pool.crvusd.controller import Position
from crvusdsim.pool.sim_interface import (
    SimLLAMMAPool,
    SimController,
    SimCurveStableSwapPool,
)
from crvusdsim.pool.sim_interface.sim_controller import DEFAULT_LIQUIDATOR
from ..modules import ExternalMarket
from ..types import SimPoolType
from ..logging import get_logger


logger = get_logger(__name__)


@dataclass
class Trade(ABC):
    """Simple trade interface."""

    def get_address(self, i: int) -> str:
        """Get the address of token `i`."""
        raise NotImplementedError

    def get_decimals(self, i: int) -> int:
        """Get the decimals of token `i`."""
        raise NotImplementedError

    def execute(
        self, amt_in: int, use_snapshot_context: bool = True
    ) -> Tuple[int, int]:
        """Perform the trade."""
        raise NotImplementedError


@dataclass
class Swap(Trade):
    """
    A `Swap` is a `Trade` that involves swapping
    two tokens in a `SimPoolType` pool.
    """

    pool: SimPoolType
    i: int
    j: int
    amt: int
    out: int = 0

    def get_address(self, i: int) -> str:
        """Get the address of token `i`."""
        if isinstance(self.pool, SimCurveStableSwapPool):
            return self.pool.coins[i].address.lower()
        return self.pool.coin_addresses[i].lower()

    def get_decimals(self, i: int) -> int:
        """Get the decimals of token `i`."""
        return self.pool.coin_decimals[i]

    def execute(
        self, amt_in: int, use_snapshot_context: bool = True
    ) -> Tuple[int, int]:
        """
        Execute the swap.

        Parameters
        ----------
        amt_in : int
            The amount of token `i` to swap in.
        use_snapshot_context : bool, default=True
            Whether or not to mutate the pool and trade state.

        Returns
        -------
        Tuple[int, int]
            The amount of collateral received, and its decimals.
        """
        pool = self.pool

        if use_snapshot_context:
            if isinstance(pool, ExternalMarket):
                amt_out = pool.trade(self.i, self.j, amt_in)
            elif isinstance(pool, (SimLLAMMAPool, SimCurveStableSwapPool)):
                amt_out = pool.get_dy(self.i, self.j, amt_in)
            else:
                raise NotImplementedError(
                    f"Trade not implemented for type {type(pool)}."
                )
        else:
            self.amt = amt_in
            result = cast(Any, pool.trade(self.i, self.j, amt_in))
            # Unpack result
            if isinstance(pool, ExternalMarket):
                amt_out = result
            elif isinstance(pool, (SimLLAMMAPool, SimCurveStableSwapPool)):
                in_amount_done, amt_out, _ = result
                if in_amount_done != amt_in:
                    logger.warning(
                        "LLAMMA amt_in %d != in_amount_done %d.", amt_in, in_amount_done
                    )
            elif isinstance(pool, SimCurvePool):
                amt_out, _ = result
            else:
                raise NotImplementedError

            self.out = amt_out

        return amt_out, self.get_decimals(self.j)

    def __repr__(self) -> str:
        return (
            f"Swap(pool={self.pool.name}, "
            f"in={self.pool.coin_names[self.i]}, "
            f"out={self.pool.coin_names[self.j]}, "
            f"amt={self.amt})"
        )


@dataclass
class Liquidation(Trade):
    """
    A `Liquidation` is a `Trade` that involves
    liquidating a crvusd borrower in a `SimController`.
    """

    controller: SimController
    position: Position
    amt: int  # to repay
    frac: float = 10**18  # does nothing
    i: int = 0  # repay stablecoin
    j: int = 1  # receive collateral
    out: int = 0

    def get_address(self, i: int) -> str:
        """Get the address of token `i`."""
        if i == 0:
            return self.controller.STABLECOIN.address.lower()
        return self.controller.COLLATERAL_TOKEN.address.lower()

    def get_decimals(self, i: int) -> int:
        """Get the decimals of token `i`."""
        if i == 0:
            return self.controller.STABLECOIN.decimals
        return self.controller.COLLATERAL_TOKEN.decimals

    def execute(
        self, amt_in: int, use_snapshot_context: bool = False
    ) -> Tuple[int, int]:
        """
        Perform the liquidation.

        Parameters
        ----------
        amt_in : int
            The amount of stablecoin to repay.
        use_snapshot_context : bool, default=True
            Whether or not to mutate the pool and trade state.

        Returns
        -------
        Tuple[int, int]
            The amount of collateral received, and its decimals.
        """
        context_manager = (
            self.controller.use_snapshot_context()
            if use_snapshot_context
            else nullcontext()
        )

        bal = self.controller.COLLATERAL_TOKEN.balanceOf[DEFAULT_LIQUIDATOR]

        with context_manager:
            self.controller.liquidate_sim(self.position)

        new_bal = self.controller.COLLATERAL_TOKEN.balanceOf[DEFAULT_LIQUIDATOR]

        amt_out = new_bal - bal
        assert amt_out > 0

        self.out = amt_out

        return amt_out, self.get_decimals(self.j)
