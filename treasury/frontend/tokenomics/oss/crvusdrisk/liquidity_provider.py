"""Provides the `LiquidityProvider` class."""
import secrets
import numpy as np
from crvusdsim.pool.sim_interface import SimCurveStableSwapPool
from .agent import Agent


# pylint: disable=too-few-public-methods
class LiquidityProvider(Agent):
    """
    The LiquidityProvider either adds or removes
    liquidity from Curve pools.
    """

    def __init__(self) -> None:
        super().__init__()
        self.address = "0x" + secrets.token_hex(20)

    def add_liquidity(
        self,
        pool: SimCurveStableSwapPool,
        amounts_: np.ndarray,
    ) -> None:
        """
        Resample liquidity amounts from a multivariate normal distribution,
        and add it to the given pool.
        """
        amounts = [int(amt) for amt in amounts_]
        for coin, amount in zip(pool.coins, amounts):
            coin._mint(self.address, amount)  # pylint: disable=protected-access
        pool.add_liquidity(amounts, _receiver=self.address)
