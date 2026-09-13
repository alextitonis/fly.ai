"""
Provides the configuration for shocks to scenarios.

We shock four possible parameters:
- GBM drift (mu) for collateral assets
- GBM volatility (sigma) for collateral assets
- Total debt in the system
- Debt : crvUSD liquidity ratio
"""
from typing import List
import pandas as pd
from .tokens import WETH, WSTETH, SFRXETH, WBTC, TBTC, USDC

# Tags
NEUTRAL = "neutral"
ADVERSE = "adverse"
SEVERE = "severe"
VERY_SEVERE = "very severe"

# Types
LIQUIDITY = "liquidity"
DEBT = "debt"
MU = "mu"
VOL = "vol"
JUMP = "jump"

ORDERING = [NEUTRAL, ADVERSE, SEVERE, VERY_SEVERE]


def order_tags(
    df: pd.DataFrame,
    col: str,
    other_cols: List[str] | None = None,
    other_cols_first: bool = True,
) -> None:
    """
    Order dataframe based on tags.
    Inplace.
    """
    df["sort"] = df[col].map(ORDERING.index)
    cols = ["sort"]
    if other_cols is not None:
        cols = other_cols + cols if other_cols_first else cols + other_cols
    df.sort_values(cols, inplace=True)
    df.drop("sort", axis=1, inplace=True)


### ============ Mu ============ ###

SHOCK_MU_NEUTRAL = {
    "target": {"WBTC": 0, "tBTC": 0, "WETH": 0, "sfrxETH": 0, "wstETH": 0},
    "type": MU,
    "tag": NEUTRAL,
    "description": "Assume no drift.",
}

SHOCK_MU_ADVERSE = {
    "target": {
        "WBTC": -19.10171,
        "tBTC": -19.10171,
        "WETH": -24.68442,
        "sfrxETH": -24.68442,
        "wstETH": -24.68442,
    },
    "type": MU,
    "tag": SEVERE,
    "description": "p05 intraday mu observed since 2020.",
}

SHOCK_MU_SEVERE = {
    "target": {
        "WBTC": -37.011385,
        "tBTC": -37.011385,
        "WETH": -47.030258,
        "sfrxETH": -47.030258,
        "wstETH": -47.030258,
    },
    "type": MU,
    "tag": SEVERE,
    "description": "p01 intraday mu observed since 2020.",
}

### =========== Debt =========== ###

SHOCK_DEBT_NEUTRAL = {
    "target": {
        "wsteth": 0.33,
        "weth": 0.075,
        "wbtc": 0.2,
        "sfrxeth": 0.2,
    },
    "type": DEBT,
    "tag": NEUTRAL,
    "description": "Average debt observed over Q4 2023 as pct of debt ceiling (total: 115M).",
}

SHOCK_DEBT_ADVERSE = {
    "target": {
        "wsteth": 0.5,
        "weth": 0.125,
        "wbtc": 0.275,
        "sfrxeth": 0.3,
    },
    "type": DEBT,
    "tag": ADVERSE,
    "description": "p99 debt oberserved over Q4 2023 as pct of debt ceiling (total: 170M).",
}

SHOCK_DEBT_SEVERE = {
    "target": {
        "wsteth": 0.99,
        "weth": 0.99,
        "wbtc": 0.99,
        "sfrxeth": 0.99,
    },
    "type": DEBT,
    "tag": SEVERE,
    "description": "99% of the current debt ceiling (total: 594M)",
}


### ============ Vol ============ ###

# Doesn't need neutral scenario, contained in price config file.

SHOCK_VOL_ADVERSE = {
    "target": {
        "WBTC": 1.877968,
        "tBTC": 1.877968,
        "WETH": 2.445831,
        "sfrxETH": 2.445831,
        "wstETH": 2.445831,
    },
    "type": VOL,
    "tag": ADVERSE,
    "description": "p99 intraday vol observed since 2020.",
}

SHOCK_VOL_SEVERE = {
    "target": {
        "WBTC": 2.816952,
        "tBTC": 2.816952,
        "WETH": 3.6687465,
        "sfrxETH": 3.6687465,
        "wstETH": 3.6687465,
    },
    "type": VOL,
    "tag": SEVERE,
    "description": "50% worse than the adverse scenario. This is massive volatility.",
}

### ========== Liquidity ========== ###

SHOCK_LIQUIDITY_NEUTRAL = {
    "target": 2.362817,
    "type": LIQUIDITY,
    "tag": NEUTRAL,
    "description": "Average debt:liquidity ratio for crvUSD over Q4 2023.",
}

SHOCK_LIQUIDITY_ADVERSE = {
    "target": 3.5,
    "type": LIQUIDITY,
    "tag": ADVERSE,
    "description": "p99.9 debt:liquidity ratio for crvUSD over Q4 2023.",
}

SHOCK_LIQUIDITY_SEVERE = {
    "target": 5.0,
    "type": LIQUIDITY,
    "tag": SEVERE,
    "description": "2x worse liquidity than the neutral scenario.",
}

SHOCK_LIQUIDITY_VERY_SEVERE = {
    "target": 10.0,
    "type": LIQUIDITY,
    "tag": VERY_SEVERE,
    "description": "4x worse liquidity than the neutral scenario.",
}

### ============ Jumps ============ ###

SHOCK_FLASH_CRASH_ADVERSE = {
    "target": {
        "type": "flash_crash",
        "coins_j": [WETH, WSTETH, SFRXETH, WBTC, TBTC],
        "mu_j": [-0.055641, -0.055641, -0.055641, -0.043453, -0.043453],
        "cov_j": [
            [0.00061425, 0.00061425, 0.00061425, 0.00050455, 0.00050455],
            [0.00061425, 0.00061425, 0.00061425, 0.00050455, 0.00050455],
            [0.00061425, 0.00061425, 0.00061425, 0.00050455, 0.00050455],
            [0.00050455, 0.00050455, 0.00050455, 0.00041445, 0.00041445],
            [0.00050455, 0.00050455, 0.00050455, 0.00041445, 0.00041445],
        ],
    },
    "type": JUMP,
    "tag": ADVERSE,
    "description": "Enforce a 4x std flash crash on all collateral assets.",
}


SHOCK_FLASH_CRASH_SEVERE = {
    "target": {
        "type": "flash_crash",
        "coins_j": [WETH, WSTETH, SFRXETH, WBTC, TBTC],
        "mu_j": [-0.135027, -0.135027, -0.135027, -0.110504, -0.110504],
        "cov_j": [
            [0.00198845, 0.00198845, 0.00198845, 0.00143551, 0.00143551],
            [0.00198845, 0.00198845, 0.00198845, 0.00143551, 0.00143551],
            [0.00198845, 0.00198845, 0.00198845, 0.00143551, 0.00143551],
            [0.00143551, 0.00143551, 0.00143551, 0.00103632, 0.00103632],
            [0.00143551, 0.00143551, 0.00143551, 0.00103632, 0.00103632],
        ],
    },
    "type": JUMP,
    "tag": SEVERE,
    "description": "Enforce a 10x std flash crash on all collateral assets.",
}

SHOCK_DEPEG_ADVERSE = {
    "target": {
        "type": "depeg",
        "coins_j": [USDC],
        "size": -0.2,
    },
    "type": JUMP,
    "tag": ADVERSE,
    "description": "Enforce a 20% depeg on USDC.",
}

SHOCK_DEPEG_SEVERE = {
    "target": {
        "type": "depeg",
        "coins_j": [USDC],
        "size": -0.99,
    },
    "type": JUMP,
    "tag": SEVERE,
    "description": "Enforce a 99% depeg on USDC.",
}
