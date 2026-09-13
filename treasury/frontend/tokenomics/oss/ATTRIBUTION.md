# OSS Attributions

This directory contains vendored open-source code used by the SHIT Protocol tokenomics simulator.

## cadCAD
- Source: https://github.com/cadCAD-org/cadCAD
- License: MIT
- Version: 0.5.3
- Modifications: Removed `dill`, `funcy`, `pathos`, `tqdm` dependencies for Pyodide/WASM compatibility.
- Usage: Simulation engine for cadCAD state machine.

## SHIT Protocol Digital Twin
- Source: https://github.com/SHIT Protocol/shit-protocol-digital-twin
- Created by: BlockScience for SHIT Protocol
- License: No explicit license file present in the repository.
- Usage: RBS (Range Bound Stability) price floor mechanics, base PSUB structure, default initial state.
- Note: This code is used at our own risk. No explicit license was provided by the upstream repository.

## Curve PegKeeper
- Source: https://github.com/curvefi/curve-stablecoin
- License: MIT
- Files: `curve/pegkeeper.py`, `curve/peg_keeper_call.py`
- Modifications: Changed `from simulation import Curve` to relative import `from .pegkeeper import Curve`.
- Usage: Curve pool math (StableSwap invariant, virtual price, exchange) and PegKeeper update logic for Bucky stablecoin peg stability.

## Liquity (Bold Protocol)
- Source: https://github.com/liquity/bold
- License: AGPL-3.0
- Files: `liquity/economic_model.py`, `liquity/active_pool.py`, `liquity/stability_pool.py`, `liquity/default_pool.py`, `liquity/trove_manager.py`, `liquity/bold_token.py`, `liquity/coll_surplus_pool.py`
- Modifications: Changed flat imports to relative package-style imports. Made `matplotlib` import optional for Pyodide compatibility.
- Usage: CDP (Collateralized Debt Position) economic model for Bucky DSS — trove management, liquidations, stability pool, collateral ratios.

## crvUSD Risk Model
- Source: https://github.com/xenophonlabs/crvUSDrisk
- License: MIT
- Files: `crvusdrisk/agent.py`, `crvusdrisk/keeper.py`, `crvusdrisk/arbitrageur.py`, `crvusdrisk/liquidator.py`, `crvusdrisk/borrower.py`, `crvusdrisk/liquidity_provider.py`, `crvusdrisk/pyodide_sim.py`, `crvusdrisk/shocks.py`, `crvusdrisk/scenarios.py`
- Modifications: Created `pyodide_sim.py` as a Pyodide-compatible port. Original agents depend on `crvusdsim`, `curvesim`, `scipy`, `sklearn` (not available in Pyodide). The port uses Curve pool math from `oss.curve.pegkeeper` and stablecoin dynamics from `oss.stablecoin.dynamics`.
- Usage: Agent-based stress testing for Bucky stablecoin — arbitrage cycles, liquidation paths, PegKeeper keeper economics, death-spiral dynamics.

## Pendle PY Index
- Source: https://github.com/pendle-finance/pendle-pt-yt-mechanism-lab
- License: GPL-3.0
- Files: `pendle/PyIndexHarness.sol`, `pendle/MarketMathHarness.sol`, `pendle/py_index_sim.py`, `pendle/py_index.py`
- Modifications: Created `py_index.py` as a Python port of `PyIndexHarness.sol` and `SimplifiedMarketMathHarness.sol`. Original `py_index_sim.py` requires `web3` and Forge artifacts. The port preserves the exact math: `pyIndexCurrent = max(SY.exchangeRate(), pyIndexStored)`, stress gap, SY-PY conversion, market proportion, exchange rate, PT price, implied APY proxy.
- Usage: wstSHIT yield accounting via Pendle-style monotonic PY index. Models accounting value vs recoverable backing divergence under SY impairment.

## Stablecoin Dynamics
- Source: Custom model based on algorithmic stablecoin death-spiral dynamics.
- License: MIT
- Files: `stablecoin/dynamics.py`, `stablecoin/parameters.py`, `stablecoin/market.py`
- Usage: Stablecoin supply/price/collateral/liquidity/demand dynamics with reflexivity, bank run dynamics, collapse thresholds. Used by crvUSD risk stress test.

## License Summary

| Repository | License | Commercial Use |
|---|---|---|
| cadCAD | MIT | Yes |
| SHIT Protocol Digital Twin | No explicit license | At own risk |
| Curve PegKeeper | MIT | Yes |
| Liquity (Bold) | AGPL-3.0 | Yes (with source disclosure) |
| crvUSD Risk | MIT | Yes |
| Pendle | GPL-3.0 | Yes (with source disclosure) |
| Stablecoin Dynamics | MIT | Yes |
