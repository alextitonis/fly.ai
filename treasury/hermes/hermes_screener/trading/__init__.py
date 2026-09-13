"""DeFi trading execution layer — lazy-loaded submodules.

Imports are deferred until attribute access to avoid heavy dependency chains
during partial use (e.g. only arbitrage_scanner)."""  # noqa: D401

from __future__ import annotations

__all__ = [
    "ContractExecutor",
    "DexAggregatorTrader",
    "LiquidityManager",
    "LiquidityDaemon",
    "PortfolioRegistry",
    "PriceOracle",
    "ProtocolLiquidityExecutor",
    "ProtocolRegistry",
    "_import",  # testing hook
]

_import = __import__  # expose for testing


def __getattr__(name: str):
    if name == "ContractExecutor":
        from hermes_screener.trading.contract_executor import ContractExecutor
        return ContractExecutor
    if name == "DexAggregatorTrader":
        from hermes_screener.trading.dex_aggregator_trader import DexAggregatorTrader
        return DexAggregatorTrader
    if name == "LiquidityManager":
        from hermes_screener.trading.liquidity_manager import LiquidityManager
        return LiquidityManager
    if name == "LiquidityDaemon":
        from hermes_screener.trading.liquidity_daemon import LiquidityDaemon
        return LiquidityDaemon
    if name == "PortfolioRegistry":
        from hermes_screener.trading.portfolio_registry import PortfolioRegistry
        return PortfolioRegistry
    if name == "PriceOracle":
        from hermes_screener.trading.price_oracle import PriceOracle
        return PriceOracle
    if name == "ProtocolLiquidityExecutor":
        from hermes_screener.trading.protocol_liquidity_executor import ProtocolLiquidityExecutor
        return ProtocolLiquidityExecutor
    if name == "ProtocolRegistry":
        from hermes_screener.trading.protocol_registry import ProtocolRegistry
        return ProtocolRegistry
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
