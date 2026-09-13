"""Provides the `Borrower` class."""
from __future__ import annotations
from typing import Tuple
import secrets
import numpy as np
from scipy.stats import gaussian_kde
from crvusdsim.pool.sim_interface import SimController
from .agent import Agent
from ..logging import get_logger

logger = get_logger(__name__)

TOLERANCE = 1e-4


def clean(
    debt_log: float, collateral_log: float, n: int, decimals: int = 18
) -> Tuple[int, int, int]:
    """
    Process log values into integers with the right decimals.
    """
    debt = int(np.exp(debt_log) * 1e18)
    collateral = int(np.exp(collateral_log) * 10**decimals)  # TODO decimals
    n = min(max(int(n), 4), 50)
    return debt, collateral, n


# pylint: disable=too-few-public-methods
class Borrower(Agent):
    """
    The Borrower either deposits or repays crvusd
    positions in the Controller.
    """

    def __init__(self) -> None:
        super().__init__()
        self.address = "0x" + secrets.token_hex(20)
        self.collateral = 0
        self.debt = 0
        self.n = 0

    def create_loan(
        self, controller: SimController, kde: gaussian_kde, multiplier: float = 1
    ) -> bool:
        """
        Create a loan in the given controller, sampled from
        the input KDE.

        The KDE is trained on (log(debt), log(collateral), n)

        The multiplier is used to scale position sizes when
        we sample larger debt ceilings. We do this for three reasons:
        1. Less loans makes simulations meaningfully faster.
        2. Larger loans result in greater price impact for liquidators.
        This makes our debt ceiling simulations more conservative.
        3. Larger debt ceilings allow for larger loans, meaning they
        are more likely to occur than what has been seen previously.

        FIXME the multiplier might be making positions less risky:
        it is not obvious that doubling debt and collateral keeps health
        constant. This needs to be investigated.
        """
        debt_log, collateral_log, n = kde.resample(1).T[0]
        debt, collateral, n = clean(
            debt_log, collateral_log, n, decimals=controller.COLLATERAL_TOKEN.decimals
        )

        debt = int(debt * multiplier)
        collateral = int(collateral * multiplier)

        controller.COLLATERAL_TOKEN._mint(  # pylint: disable=protected-access
            self.address, collateral
        )

        try:
            controller.health_calculator(self.address, collateral, debt, False, n)
            controller.create_loan(self.address, collateral, debt, n)
        except AssertionError as e:
            if str(e) == "Debt too high":
                debt = controller.max_borrowable(collateral, n)
                if debt == 0:
                    logger.warning(
                        "Controller %s won't accept any more debt.", controller.AMM.name
                    )
                    del controller.loan[self.address]  # remove the key
                    return False
                controller.create_loan(self.address, collateral, debt, n)
            else:
                raise e

        self.debt = debt
        self.collateral = collateral
        self.n = n

        return True
