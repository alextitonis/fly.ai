"""
Provides the configs for simulating alternate
parameter sets and the functions required to
enforce parameter changes.

Parameters we currently test:

- Market Debt ceilings
- Loan and Liquidation Discounts
- Oracle chainlink limits
- LLAMMA fees
"""
from __future__ import annotations
from typing import TYPE_CHECKING, cast
from crvusdsim.pool.crvusd.price_oracle.crypto_with_stable_price.base import Oracle

if TYPE_CHECKING:
    from ..sim import Scenario

DEBT_CEILING = "debt_ceiling"
CHAINLINK_LIMIT = "chainlink_limit"
FEE = "fee"

MODELED_PARAMETERS = [
    DEBT_CEILING,
    CHAINLINK_LIMIT,
    FEE,
]

### ============ Debt Ceilings ============ ###

# pylint: disable=pointless-string-statement
"""
Notes: being as conservative as possible, we can say that
(like) 99% of the debt ceiling is realized as debt. Of course, this
means that users would be paying really high rates, but let's pretend
that's reasonable.

It seems that, based on the current debt ceilings, things are ok. So
let's consider less conservative debt ceilings. We can then zoom in later.

We scale all of the debt ceilings by the same amount. We can then look
at the Bad Debt in each controller to see if different collaterals can handle
different increases.
"""

DEBT_CEILING_SAMPLES = [1, 2, 5, 10]
DEBT_CEILING_SWEEP = [{DEBT_CEILING: sample} for sample in DEBT_CEILING_SAMPLES]


def set_debt_ceilings(scenario: Scenario, target: float) -> None:
    """
    Multiplies the debt ceiling of the input controller.
    """
    for controller in scenario.controllers:
        debt_ceiling = controller.FACTORY.debt_ceiling[controller.address]
        new_debt_ceiling = int(debt_ceiling * target)
        controller.FACTORY.set_debt_ceiling(controller.address, new_debt_ceiling)


### ============ Chainlink Limits ============ ###

CHAINLINK_LIMIT_SAMPLES = [int(l * 1e18) for l in [0.015, 0.03, 0.05, 0.1, 0.15]]
CHAINLINK_LIMIT_SWEEP = [
    {CHAINLINK_LIMIT: sample} for sample in CHAINLINK_LIMIT_SAMPLES
]


def set_chainlink_limits(scenario: Scenario, target: float) -> None:
    """
    Sets the chainlink limit for each oracle with the target
    bounds.
    """
    for llamma in scenario.llammas:
        oracle = cast(Oracle, llamma.price_oracle_contract)
        decimals = llamma.COLLATERAL_TOKEN.decimals
        oracle.set_chainlink(oracle.price(), decimals, target)  # tiny bounds


### ============ LLAMMA Fees ============ ###

FEE_SAMPLES = [int(l * 1e18) for l in [0.005, 0.006, 0.007, 0.008, 0.009, 0.01]]
FEE_SWEEP = [{FEE: sample} for sample in FEE_SAMPLES]


def set_fees(scenario: Scenario, target: float) -> None:
    """
    Sets the chainlink limit for each oracle with the target
    bounds.
    """
    for llamma in scenario.llammas:
        llamma.set_fee(target)


### ============ Parameter Sweep ============ ###


def set_parameters(scenario: Scenario, parameters: dict[str, float]) -> None:
    """
    Sets the parameters in the input scenario.
    """
    for parameter, value in parameters.items():
        if parameter == DEBT_CEILING:
            set_debt_ceilings(scenario, value)
        elif parameter == CHAINLINK_LIMIT:
            set_chainlink_limits(scenario, value)
        elif parameter == FEE:
            set_fees(scenario, value)
        else:
            raise ValueError(f"Invalid parameter {parameter}.")
