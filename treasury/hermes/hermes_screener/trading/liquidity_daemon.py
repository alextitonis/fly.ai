from __future__ import annotations

import logging
import time
from dataclasses import asdict
from decimal import Decimal
from pathlib import Path

from hermes_screener.config import settings
from hermes_screener.trading.dex_aggregator_trader import DexAggregatorTrader
from hermes_screener.trading.liquidity_manager import (
    KaminoAdapter,
    LiquidityManager,
    NoDeploymentPathError,
    PoolOpportunity,
)
from hermes_screener.trading.portfolio_registry import PortfolioRegistry, TokenSpec
from hermes_screener.trading.price_oracle import PriceOracle
from hermes_screener.trading.protocol_liquidity_executor import ProtocolLiquidityExecutor
from hermes_screener.trading.protocol_registry import NATIVE_ETH

logger = logging.getLogger(__name__)


class LiquidityDaemon:
    """
    Orchestrates liquidity deployment with zero-idle objective.

    This daemon does planning and execution dispatch:
    - gathers balances
    - gathers yield opportunities from Arrakis/Gamma/Kamino + existing trader APIs
    - builds strict deployment plan (raises if non-dust idle remains)
    - executes actions via existing trader + protocol adapters
    """

    def __init__(self, loop_seconds: int = 300, live_deploy: bool = False):
        self.trader = DexAggregatorTrader()
        self.loop_seconds = loop_seconds
        self.live_deploy = live_deploy
        self.manager = LiquidityManager(
            gas_reserve={"WETH": 0.0002, "ETH": 0.0002, "SOL": 0.01, "USDC": 5.0},
            dust_threshold_usd=1.0,
            max_slippage_bps=50,
        )
        self.registry = PortfolioRegistry(settings.hermes_home / "data" / "trading" / "portfolio_tokens.json")
        self.oracle = PriceOracle(settings.hermes_home / "data" / "trading" / "price_cache.json")
        self.protocol_executor = ProtocolLiquidityExecutor(self.trader, live_deploy=live_deploy)

    def _default_tokens(self) -> list[TokenSpec]:
        return [
            TokenSpec(symbol="WETH", chain="base", address="0x4200000000000000000000000000000000000006", decimals=18),
            TokenSpec(symbol="USDC", chain="base", address="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals=6),
            TokenSpec(symbol="SOL", chain="solana", address="So11111111111111111111111111111111111111112", decimals=9),
            TokenSpec(
                symbol="USDC", chain="solana", address="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals=6
            ),
        ]

    def _tracked_tokens(self) -> list[TokenSpec]:
        tokens = self.registry.load()
        if not tokens:
            tokens = self._default_tokens()
            self.registry.save(tokens)
        return tokens

    def _collect_base_token_balances(self, tracked: list[TokenSpec]) -> dict[str, float]:
        out: dict[str, float] = {}
        for t in tracked:
            if t.chain != "base":
                continue
            # WETH tracked as native funding bucket in this bot's current base flow.
            if t.symbol == "WETH":
                continue
            bal = self.trader.get_token_balance(t.address, "base")
            if bal > 0:
                out[t.symbol] = out.get(t.symbol, 0.0) + float(bal)
        return out

    def _collect_solana_token_balances(self, tracked: list[TokenSpec]) -> dict[str, float]:
        out: dict[str, float] = {}
        if not self.trader.solana_adapter:
            return out
        for t in tracked:
            if t.chain != "solana":
                continue
            if t.symbol == "SOL":
                continue
            raw = self.trader.solana_adapter.get_token_balance(t.address)
            if raw > 0:
                out[t.symbol] = out.get(t.symbol, 0.0) + float(raw) / float(10**t.decimals)
        return out

    def collect_balances(self) -> dict[str, float]:
        tracked = self._tracked_tokens()
        base_native = float(self.trader.get_evm_balance()) if self.trader.evm_account else 0.0
        sol_native = float(self.trader.get_solana_balance()) if self.trader.solana_keypair else 0.0

        balances = {
            "WETH": base_native,
            "SOL": sol_native,
        }

        for k, v in self._collect_base_token_balances(tracked).items():
            balances[k] = balances.get(k, 0.0) + v
        for k, v in self._collect_solana_token_balances(tracked).items():
            balances[k] = balances.get(k, 0.0) + v

        return balances

    def collect_prices(self) -> dict[str, float]:
        tracked = self._tracked_tokens()
        prices = self.oracle.get_prices(tracked)
        # Enforce known pegs/fallbacks for core routing assets.
        prices.setdefault("USDC", 1.0)
        prices.setdefault("WETH", 3000.0)
        prices.setdefault("SOL", 150.0)
        return prices

    def collect_opportunities(self) -> list[PoolOpportunity]:
        opportunities: list[PoolOpportunity] = []

        tracked = self._tracked_tokens()
        tracked_by_symbol = {t.symbol: t for t in tracked}

        # Existing trader's Kyber pool probe as signal source for EVM pools.
        pool = self.trader.get_pool_info(
            "0x4200000000000000000000000000000000000006",  # WETH
            "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # USDC
            "base",
        )
        if pool:
            opportunities.append(
                PoolOpportunity(
                    id="arrakis-base-weth-usdc",
                    protocol="arrakis",
                    chain="base",
                    token_a="WETH",
                    token_b="USDC",
                    apr=float(pool.get("apr", 8.0) or 8.0) / 100.0,
                    supports_single_sided=False,
                    max_allocation_usd=50_000,
                )
            )
            opportunities.append(
                PoolOpportunity(
                    id="gamma-base-weth-usdc",
                    protocol="gamma",
                    chain="base",
                    token_a="WETH",
                    token_b="USDC",
                    apr=max(0.01, float(pool.get("apr", 8.0) or 8.0) / 120.0),
                    supports_single_sided=False,
                    max_allocation_usd=50_000,
                )
            )

        # Build pair opportunities for every tracked base token via WETH/USDC.
        for symbol, spec in tracked_by_symbol.items():
            if spec.chain != "base":
                continue
            if symbol in {"WETH", "USDC"}:
                continue
            opportunities.append(
                PoolOpportunity(
                    id=f"gamma-base-{symbol.lower()}-weth",
                    protocol="gamma",
                    chain="base",
                    token_a=symbol,
                    token_b="WETH",
                    apr=0.10,
                    supports_single_sided=False,
                    max_allocation_usd=50_000,
                )
            )
            opportunities.append(
                PoolOpportunity(
                    id=f"arrakis-base-{symbol.lower()}-usdc",
                    protocol="arrakis",
                    chain="base",
                    token_a=symbol,
                    token_b="USDC",
                    apr=0.08,
                    supports_single_sided=False,
                    max_allocation_usd=50_000,
                )
            )

        # Kamino single-sided capable opportunities.
        opportunities.append(
            PoolOpportunity(
                id="kamino-sol-usdc",
                protocol="kamino",
                chain="solana",
                token_a="SOL",
                token_b="USDC",
                apr=0.12,
                supports_single_sided=True,
                max_allocation_usd=50_000,
            )
        )
        opportunities.append(
            PoolOpportunity(
                id="kamino-usdc-single",
                protocol="kamino",
                chain="solana",
                token_a="USDC",
                token_b=None,
                apr=0.06,
                supports_single_sided=True,
                max_allocation_usd=50_000,
            )
        )

        # For each tracked Solana token, add single-sided-capable Kamino route to USDC.
        for symbol, spec in tracked_by_symbol.items():
            if spec.chain != "solana" or symbol in {"SOL", "USDC"}:
                continue
            opportunities.append(
                PoolOpportunity(
                    id=f"kamino-{symbol.lower()}-usdc",
                    protocol="kamino",
                    chain="solana",
                    token_a=symbol,
                    token_b="USDC",
                    apr=0.09,
                    supports_single_sided=True,
                    max_allocation_usd=50_000,
                )
            )

        return opportunities

    def _symbol_to_token(self, symbol: str, chain: str) -> str | None:
        tracked = self._tracked_tokens()
        for t in tracked:
            if t.chain == chain and t.symbol == symbol.upper():
                return t.address
        fallback = self.trader.get_token_address(symbol, chain)
        return fallback

    def _execute_base_swap(self, token_in_symbol: str, token_out_symbol: str, amount_in_ui: float) -> bool:
        if not self.trader.contract_executor:
            return False

        token_in_addr = self._symbol_to_token(token_in_symbol, "base")
        token_out_addr = self._symbol_to_token(token_out_symbol, "base")
        if not token_in_addr or not token_out_addr:
            return False

        # Native gas bucket alias
        in_is_native = token_in_symbol.upper() in {"ETH", "WETH"}
        token_in_for_contract = NATIVE_ETH if in_is_native else token_in_addr

        in_decimals = 18
        if not in_is_native:
            in_decimals = 6 if token_in_symbol.upper() in {"USDC", "USDT"} else 18

        amount_in = int(Decimal(str(amount_in_ui)) * Decimal(10**in_decimals))
        if amount_in <= 0:
            return False

        quotes = self.trader.compare_quotes("base", token_in_addr, token_out_addr, str(amount_in))
        api_routes = {}
        for proto in ["kyberswap", "odos", "velora", "1inch", "paraswap"]:
            if proto in quotes and isinstance(quotes[proto], dict) and "_tx" in quotes[proto]:
                api_routes[proto] = quotes[proto]["_tx"]

        tx_hash = self.trader.contract_executor.smart_swap(
            chain="base",
            token_in=token_in_for_contract,
            token_out=token_out_addr,
            amount_in=amount_in,
            slippage_bps=100,
            api_routes=api_routes,
        )
        return bool(tx_hash)

    def _execute_solana_swap(self, token_in_symbol: str, token_out_symbol: str, amount_in_ui: float) -> bool:
        if not self.trader.solana_adapter:
            return False

        in_addr = self._symbol_to_token(token_in_symbol, "solana")
        out_addr = self._symbol_to_token(token_out_symbol, "solana")
        if not in_addr or not out_addr:
            return False

        in_decimals = 9 if token_in_symbol.upper() == "SOL" else 6
        amount_in = int(Decimal(str(amount_in_ui)) * Decimal(10**in_decimals))
        if amount_in <= 0:
            return False

        sig = self.trader.solana_adapter.swap(in_addr, out_addr, amount_in, slippage_bps=100)
        return bool(sig)

    def execute_action(self, action: dict) -> bool:
        t = action["action_type"]
        d = action["details"]
        protocol = action["protocol"]

        if t == "swap_for_pair_balance":
            token_in = d["from_token"]
            token_out = d["to_token"]
            chain = action["chain"]
            amount_ui = float(d.get("from_amount", 0.0))
            if amount_ui <= 0:
                return False

            if chain == "base":
                return self._execute_base_swap(token_in, token_out, amount_ui)
            if chain == "solana":
                return self._execute_solana_swap(token_in, token_out, amount_ui)
            return False

        if t in {"deploy_dual_sided", "deploy_single_asset", "deploy_single_sided"}:
            # Phase 3: execute protocol-native deploy legs when target config exists.
            if self.protocol_executor.execute_deploy_action(action):
                return True

            # If protocol execution is unavailable, keep explicit recipe logs.
            if protocol == "kamino":
                side = "A"
                if d.get("deposit_token") == "USDC":
                    side = "B"
                kamino_recipe = KaminoAdapter.build_single_sided_deposit(
                    strategy_address=d.get("opportunity_id", ""),
                    deposit_token_side=side,
                    amount_decimal=float(d.get("deposit_amount", 0.0)),
                    slippage_bps=50,
                )
                logger.info("kamino_recipe_fallback=%s", kamino_recipe)
                return False

            logger.info("planned_%s_fallback action=%s", protocol, d)
            return False

        logger.warning("unknown_action_type=%s", t)
        return False

    def run_cycle(self) -> dict:
        balances = self.collect_balances()
        prices = self.collect_prices()
        opportunities = self.collect_opportunities()

        if not opportunities:
            return {"status": "no-opportunities", "balances": balances}

        plan = self.manager.build_plan(balances, prices, opportunities)
        results = []
        for action in plan.actions:
            ok = self.execute_action(asdict(action))
            results.append({"action": asdict(action), "ok": ok})

        return {
            "status": "ok",
            "utilization_pct": plan.utilization_pct,
            "projected_idle": plan.projected_idle,
            "actions": len(plan.actions),
            "executed": results,
        }

    def run_forever(self) -> None:
        while True:
            try:
                out = self.run_cycle()
                logger.info("liquidity_cycle=%s", out)
            except NoDeploymentPathError as exc:
                logger.error("non_deployable_idle=%s", exc)
            except Exception as exc:
                logger.exception("liquidity_cycle_failed: %s", exc)
            time.sleep(self.loop_seconds)
