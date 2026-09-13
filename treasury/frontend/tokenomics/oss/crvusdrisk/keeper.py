"""Provides the `Keeper` class."""

from typing import List
from crvusdsim.pool import PegKeeper
from .agent import Agent
from ..logging import get_logger

PRECISION = 1e18

logger = get_logger(__name__)


def get_pk_symbols(pk: PegKeeper) -> str:
    """Get symbols for a PegKeeper."""
    return pk.POOL.name.replace("Curve.fi Factory Plain Pool: ", "")


# pylint: disable=too-few-public-methods
class Keeper(Agent):
    """
    Keeper calls the `update` method on `PegKeeper`s.
    """

    address: str = "DEFAULT_KEEPER"

    def __init__(self, tolerance: float = 0):
        """
        Note
        ----
        The `tolerance` must be in LP share units
        (decimals = 18).
        """
        super().__init__()
        assert tolerance >= 0
        self.tolerance = tolerance

    def update(self, pks: List[PegKeeper]) -> None:
        """
        Checks if any PegKeeper is profitable to update. Updates
        if profitable.

        Parameters
        ----------
        pks : List[PegKeeper]
            List of PegKeeper objects to check.
        """
        for pk in pks:
            estimate = pk.estimate_caller_profit()
            if estimate > self.tolerance:
                _profit = pk.update(self.address) / 1e18
                _profit *= pk.POOL.get_virtual_price() / 1e18
                assert _profit > 0, "Update not profitable."
                self._profit[pk.address] += _profit
                self._count[pk.address] += 1
                logger.debug(
                    "Updating %s Peg Keeper with profit %d.",
                    get_pk_symbols(pk),
                    round(_profit / PRECISION),
                )
            else:
                logger.debug(
                    "Not updating %s Peg Keeper.",
                    get_pk_symbols(pk),
                )
