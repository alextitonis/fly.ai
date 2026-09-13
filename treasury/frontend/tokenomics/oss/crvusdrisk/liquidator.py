"""Provides the `Liquidator` class."""
import math
from typing import List, Dict, cast
from dataclasses import dataclass
from collections import defaultdict
from crvusdsim.pool.crvusd.controller import Position
from crvusdsim.pool.sim_interface import SimController
from crvusdsim.pool.sim_interface.sim_stableswap import SimCurveStableSwapPool
from .agent import Agent
from ..modules import ExternalMarket
from ..trades.cycle import Swap, Liquidation, Cycle
from ..utils import get_crvusd_index
from ..configs import TOKEN_DTOs, DEFAULT_PROFIT_TOLERANCE
from ..prices import PriceSample
from ..types import MarketsType
from ..data_transfer_objects import TokenDTO
from ..logging import get_logger


logger = get_logger(__name__)


@dataclass
class Path:
    """Simple dataclass to store liquidation paths."""

    basis_token: TokenDTO
    crvusd_pool: SimCurveStableSwapPool
    collat_pool: ExternalMarket


class Liquidator(Agent):
    """
    The Liquidator performs hard liquidations on LLAMMAs.
    Liquidations are routed through `Path`s, which are
    set by the `set_paths` function. A Path will always
    be a `Cycle` of trades that begins and ends with a
    `basis_token`.

    Example
    -------
    With USDC as the basis token,
    a liquidation will look like:
    1. Purchase crvUSD from the crvUSD/USDC pool.
    2. Liquidate the user in the Controller.
    3. Sell collateral for USDC in the USDC/collateral External Market.
    """

    # pylint: disable=too-many-instance-attributes
    def __init__(self, tolerance: float = DEFAULT_PROFIT_TOLERANCE):
        super().__init__()
        assert tolerance >= 0
        self.tolerance = tolerance
        self.collateral_liquidated: Dict[str, int] = defaultdict(int)
        self.debt_repaid: Dict[str, float] = defaultdict(float)
        self.basis_tokens = [
            TOKEN_DTOs["0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],  # USDC
            TOKEN_DTOs["0xdac17f958d2ee523a2206206994597c13d831ec7"],  # USDT
        ]
        self.paths: Dict[str, List[Path]] = {}

    def set_paths(
        self,
        controllers: List[SimController],
        crvusd_pools: List[SimCurveStableSwapPool],
        collat_pools: MarketsType,
    ) -> None:
        """
        Set the paths for liquidations. Currently:
        1. Purchase crvusd from basis_token/crvusd pools.
        2. Liquidate the user in the Controller.
        3. Sell collateral for basis_token in collateral/basis_token
        External markets.
        """
        for controller in controllers:
            collateral = TOKEN_DTOs[controller.COLLATERAL_TOKEN.address]

            paths = []
            for basis_token in self.basis_tokens:
                pair = (
                    min(basis_token, collateral),
                    max(basis_token, collateral),
                )  # sorted

                # Get basis_token/crvusd pool
                for pool in crvusd_pools:
                    coins = [c.address for c in pool.coins]
                    if basis_token.address in coins:
                        crvusd_pool = pool
                        break

                # Get collateral/basis_token pool
                collat_pool = collat_pools[pair]
                paths.append(Path(basis_token, crvusd_pool, collat_pool))

            self.paths[controller.address] = paths

    def perform_liquidations(
        self,
        controllers: List[SimController],
        prices: PriceSample,
    ) -> None:
        """
        Loops through all liquidatable users and liquidates if profitable.

        Parameters
        ----------
        controller : Controller
            Controller object.

        Returns
        -------
        profit : float
            Profit in USD units from liquidations.
        count : int
            Count of liquidations performed.
        """
        for controller in controllers:
            logger.debug("Liquidating users in controller %s.", controller.address)

            controller.AMM.price_oracle_contract.freeze()
            to_liquidate = controller.users_to_liquidate()
            controller.AMM.price_oracle_contract.unfreeze()

            logger.debug("There are %d users to liquidate.", len(to_liquidate))

            count = 0
            for position in to_liquidate:
                count += self.maybe_liquidate(position, controller, prices)

            logger.debug(
                "There are %d users left to liquidate", len(to_liquidate) - count
            )

    # pylint: disable=too-many-locals
    def maybe_liquidate(
        self,
        position: Position,
        controller: SimController,
        prices: PriceSample,
    ) -> bool:
        """
        This is the hard liquidation:
        1. Liquidator checks the crvusd debt they'll have to repay.
        2. For each basis token (e.g. USDC, USDT) they:
            a. Compute how much of the basis token they must swap
            to obtain the necessary crvusd.
            b. Compute how much of the basis token they receive
            from selling the corresponding collateral.
            c. Profit = b - a
        3. They take the most profitable route. If this profit > 0,
        they perform the liquidations.
        or USDT) that gives them the most profit, if this profit > 0.

        Updates internal Liquidator state.

        Note
        ----
        TODO incorporate liquidations that source crvusd partly from
        USDC and partly from USDT.
        TODO incorporate liquidations against other tokens (not just
        USDC and USDT).
        """
        user = position.user
        health = position.health

        if controller.health(user, full=True) > 0:
            logger.debug("User %s is no longer liquidatable.", user)
            return False

        to_repay = int(controller.tokens_to_liquidate(user))
        _, y = controller.AMM.get_sum_xy(user)
        y = int(y)

        best = None
        best_expected_profit = -math.inf

        collateral = controller.COLLATERAL_TOKEN.address

        for path in self.paths[controller.address]:
            crvusd_pool = path.crvusd_pool
            collat_pool = path.collat_pool

            # basis token -> crvusd
            j = get_crvusd_index(crvusd_pool)
            i = j ^ 1

            if to_repay >= crvusd_pool.balances[j]:
                logger.debug(
                    "Not enough crvusd in pool %s for liquidation.", crvusd_pool.name
                )
                continue

            amt_in = crvusd_pool.get_dx(i, j, to_repay)
            trade1 = Swap(crvusd_pool, i, j, amt_in)

            # crvusd -> collateral
            trade2 = Liquidation(controller, position, to_repay)

            # collateral -> basis token
            i = collat_pool.coin_addresses.index(collateral)
            j = i ^ 1
            trade3 = Swap(collat_pool, i, j, y)
            amt_out, decimals = trade3.execute(y, use_snapshot_context=True)

            expected_profit = (amt_out - amt_in) / 10**decimals

            cycle = Cycle([trade1, trade2, trade3], expected_profit=expected_profit)

            if not best or expected_profit > best_expected_profit:
                best = cycle
                best_expected_profit = expected_profit

        if best and best_expected_profit > self.tolerance:
            logger.debug(
                "Liquidating user %s with expected profit: %f.",
                user,
                best_expected_profit,
            )
            profit = best.execute()
            logger.debug("Liquidated user %s with profit: %f.", user, profit)

            # Update state
            self._profit[controller.address] += profit
            self._count[controller.address] += 1

            external = best.trades[2]
            liquidation = cast(Liquidation, best.trades[1])
            position = liquidation.position

            self.collateral_liquidated[
                controller.address
            ] += external.amt / 10 ** external.get_decimals(external.i)

            self.debt_repaid[  # Includes the liquidated user's crvusd in llamma
                controller.address
            ] += position.debt / 10 ** liquidation.get_decimals(liquidation.i)

            self.update_borrower_losses(best, prices)

            return True

        logger.debug(
            "Missed liquidation for user %s. Health: %f. Expected profit: %f.",
            user,
            health,
            best_expected_profit,
        )

        return False
