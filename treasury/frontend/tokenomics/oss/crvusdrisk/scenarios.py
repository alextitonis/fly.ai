"""
Provides the configuration for scenarios.

A scenario requires:
- A timestep frequency
- A number of timesteps
- A date range for fetching quotes (for external slippage curves).
- A date range for analyzing prices (mu, vol, cov) to generate prices.
- A date range for analyzing debt positions (to generate debt).
- A date range for analyzing stableswap pools (to generate crvUSD liquidity).
- [OPTIONAL] A set of scenario shocks.
"""
from typing import Dict
from .shocks import (
    SHOCK_VOL_ADVERSE,
    SHOCK_VOL_SEVERE,
    SHOCK_MU_ADVERSE,
    SHOCK_MU_SEVERE,
    SHOCK_DEBT_ADVERSE,
    SHOCK_DEBT_SEVERE,
    SHOCK_LIQUIDITY_ADVERSE,
    SHOCK_LIQUIDITY_SEVERE,
    SHOCK_MU_NEUTRAL,
    SHOCK_DEBT_NEUTRAL,
    SHOCK_LIQUIDITY_NEUTRAL,
    SHOCK_FLASH_CRASH_ADVERSE,
    SHOCK_FLASH_CRASH_SEVERE,
    SHOCK_DEPEG_ADVERSE,
    SHOCK_DEPEG_SEVERE,
    SHOCK_LIQUIDITY_VERY_SEVERE,
)

BASE = {
    "freq": "5min",
    "N": 288,
    "quotes": {"start": 1700438400, "end": 1703030400},
    "prices": {"start": 1697068800, "end": 1704585600},
    "borrowers": {
        "start": 1696132800,
        "end": 1704085200,
    },
    "liquidity": {"start": 1696132800, "end": 1704085200},
    "subgraph_end_ts": 1705467600,
}


def add_neutral_shocks(shocks: list) -> list:
    """
    Adds the neutral shocks to the list of shocks.
    The only shock that is not necessary is volatility,
    since the neutral value is gleaned from the price config.
    """
    shock_types = [shock["type"] for shock in shocks]
    if "mu" not in shock_types:
        shocks.append(SHOCK_MU_NEUTRAL)
    if "debt" not in shock_types:
        shocks.append(SHOCK_DEBT_NEUTRAL)
    if "liquidity" not in shock_types:
        shocks.append(SHOCK_LIQUIDITY_NEUTRAL)
    return shocks


def make_scenario(shocks: list, name: str) -> dict:
    """
    Makes a scenario from a list of shocks.
    """
    return BASE | {"name": name, "shocks": add_neutral_shocks(shocks)}


SCENARIO_SHOCKS: Dict[str, list] = {
    # Base Scenarios
    "Baseline": [],
    "Adverse vol": [SHOCK_VOL_ADVERSE],
    "Severe vol": [SHOCK_VOL_SEVERE],
    "Adverse drift": [SHOCK_MU_ADVERSE],
    "Severe drift": [SHOCK_MU_SEVERE],
    "Adverse Growth": [SHOCK_DEBT_ADVERSE],
    "Severe Growth": [SHOCK_DEBT_SEVERE],
    "Adverse crvUSD Liquidity": [SHOCK_LIQUIDITY_ADVERSE],
    "Severe crvUSD Liquidity": [SHOCK_LIQUIDITY_SEVERE],
    "Very severe crvUSD Liquidity": [SHOCK_LIQUIDITY_VERY_SEVERE],
    "Adverse flash crash": [SHOCK_FLASH_CRASH_ADVERSE],
    "Severe flash crash": [SHOCK_FLASH_CRASH_SEVERE],
    "Adverse depeg": [SHOCK_DEPEG_ADVERSE],
    "Severe depeg": [SHOCK_DEPEG_SEVERE],
    # Severe Vol Composites
    "Severe vol and adverse drift": [SHOCK_VOL_SEVERE, SHOCK_MU_ADVERSE],
    "Severe vol and severe drift": [SHOCK_VOL_SEVERE, SHOCK_MU_SEVERE],
    "Severe vol and adverse growth": [SHOCK_VOL_SEVERE, SHOCK_DEBT_ADVERSE],
    "Severe vol and severe growth": [SHOCK_VOL_SEVERE, SHOCK_DEBT_SEVERE],
    "Severe vol and adverse crvUSD liquidity": [
        SHOCK_VOL_SEVERE,
        SHOCK_LIQUIDITY_ADVERSE,
    ],
    "Severe vol and severe crvUSD liquidity": [
        SHOCK_VOL_SEVERE,
        SHOCK_LIQUIDITY_SEVERE,
    ],
    "Severe vol and very severe crvUSD liquidity": [
        SHOCK_VOL_SEVERE,
        SHOCK_LIQUIDITY_VERY_SEVERE,
    ],
    # Flash Crash Composites
    "Adverse flash crash and adverse growth": [
        SHOCK_FLASH_CRASH_ADVERSE,
        SHOCK_DEBT_ADVERSE,
    ],
    "Adverse flash crash and severe growth": [
        SHOCK_FLASH_CRASH_ADVERSE,
        SHOCK_DEBT_SEVERE,
    ],
    "Adverse flash crash and adverse crvUSD liquidity": [
        SHOCK_FLASH_CRASH_ADVERSE,
        SHOCK_LIQUIDITY_ADVERSE,
    ],
    "Adverse flash crash and severe crvUSD liquidity": [
        SHOCK_FLASH_CRASH_ADVERSE,
        SHOCK_LIQUIDITY_SEVERE,
    ],
    # Depeg Composites
    # "Adverse depeg and adverse growth": [SHOCK_DEPEG_ADVERSE, SHOCK_DEBT_ADVERSE],
    # "Adverse depeg and severe growth": [SHOCK_DEPEG_ADVERSE, SHOCK_DEBT_SEVERE],
    "test": [],
}

SCENARIOS = {
    name.lower(): make_scenario(shocks, name)
    for name, shocks in SCENARIO_SHOCKS.items()
}

SCENARIOS["test"]["N"] = 2
