"""Provides the base `Agent` class."""
from __future__ import annotations
from abc import ABC
from functools import cached_property
from collections import defaultdict
from typing import TYPE_CHECKING, Dict
from ..logging import get_logger

logger = get_logger(__name__)

if TYPE_CHECKING:
    from ..prices import PriceSample
    from ..trades import Cycle


TOLERANCE = -10  # USD


# pylint: disable=too-few-public-methods
class Agent(ABC):
    """Base class for agents."""

    def __init__(self) -> None:
        self._profit: Dict[str, float] = defaultdict(float)
        self._count: Dict[str, int] = defaultdict(int)
        self._borrower_loss = 0.0

    def profit(self, address: str | None = None) -> float:
        """Return the profit."""
        if not address:
            return sum(self._profit.values())
        return self._profit[address]

    def count(self, address: str | None = None) -> int:
        """Return the count."""
        if not address:
            return sum(self._count.values())
        return self._count[address]

    @property
    def borrower_loss(self) -> float:
        """Return the borrower loss."""
        return self._borrower_loss

    @cached_property
    def name(self) -> str:
        """Agent name."""
        return type(self).__name__

    def update_borrower_losses(self, cycle: Cycle, prices: PriceSample) -> None:
        """
        Update the borrower loss. Applicable to
        the Liquidator and Arbitrageur child classes.
        """
        for i in cycle.llamma_trades:
            trade = cycle.trades[i]
            token_in = (
                trade.amt
                / 10 ** trade.get_decimals(trade.i)
                * prices.prices_usd[trade.get_address(trade.i)]
            )
            token_out = (
                trade.out
                / 10 ** trade.get_decimals(trade.j)
                * prices.prices_usd[trade.get_address(trade.j)]
            )
            borrower_loss = token_out - token_in
            if borrower_loss < TOLERANCE:
                logger.debug(
                    "Borrower loss was positive for cycle %s: %f", cycle, borrower_loss
                )
            self._borrower_loss += borrower_loss
