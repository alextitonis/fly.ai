from __future__ import annotations

import json
import logging
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

from web3 import Web3

from hermes_screener.config import settings
from hermes_screener.trading.portfolio_registry import PortfolioRegistry

logger = logging.getLogger(__name__)


ARRAKIS_VAULT_ABI = [
    {
        "type": "function",
        "name": "token0",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
    },
    {
        "type": "function",
        "name": "token1",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
    },
    {
        "type": "function",
        "name": "mint",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "mintAmount_", "type": "uint256"},
            {"name": "receiver_", "type": "address"},
        ],
        "outputs": [
            {"name": "amount0", "type": "uint256"},
            {"name": "amount1", "type": "uint256"},
        ],
    },
]

ARRAKIS_RESOLVER_ABI = [
    {
        "type": "function",
        "name": "getMintAmounts",
        "stateMutability": "view",
        "inputs": [
            {"name": "vaultV2_", "type": "address"},
            {"name": "amount0Max_", "type": "uint256"},
            {"name": "amount1Max_", "type": "uint256"},
        ],
        "outputs": [
            {"name": "amount0", "type": "uint256"},
            {"name": "amount1", "type": "uint256"},
            {"name": "mintAmount", "type": "uint256"},
        ],
    }
]

GAMMA_MANAGER_ABI = [
    {
        "type": "function",
        "name": "deposit",
        "stateMutability": "payable",
        "inputs": [
            {"name": "deposit0Desired", "type": "uint256"},
            {"name": "deposit1Desired", "type": "uint256"},
            {"name": "to", "type": "address"},
            {"name": "from", "type": "address"},
        ],
        "outputs": [
            {"name": "", "type": "uint256"},
            {"name": "", "type": "uint256"},
            {"name": "", "type": "uint256"},
        ],
    }
]


@dataclass(frozen=True)
class LiquidityTarget:
    id: str
    protocol: str
    chain: str
    config: dict


class ProtocolLiquidityExecutor:
    """
    Executes protocol-native deposit legs.

    Targets are configured in ~/.hermes/data/trading/liquidity_targets.json
    and keyed by opportunity_id.
    """

    def __init__(self, trader, live_deploy: bool = False):
        self.trader = trader
        self.live_deploy = live_deploy
        self.targets_path = settings.hermes_home / "data" / "trading" / "liquidity_targets.json"
        self.registry = PortfolioRegistry(settings.hermes_home / "data" / "trading" / "portfolio_tokens.json")

    def _load_targets(self) -> dict[str, LiquidityTarget]:
        if not self.targets_path.exists():
            return {}
        data = json.loads(self.targets_path.read_text())
        out = {}
        for item in data:
            t = LiquidityTarget(
                id=item["id"],
                protocol=item["protocol"],
                chain=item["chain"],
                config=item,
            )
            out[t.id] = t
        return out

    def _symbol_to_spec(self, symbol: str, chain: str):
        symbol = symbol.upper()
        for spec in self.registry.load():
            if spec.chain == chain and spec.symbol == symbol:
                return spec
        return None

    def _to_base_units(self, amount_ui: float, decimals: int) -> int:
        return int(max(0.0, float(amount_ui)) * (10**decimals))

    def _build_and_send(self, fn) -> str | None:
        ce = self.trader.contract_executor
        if not ce or not ce.w3:
            return None

        tx = fn.build_transaction(
            {
                "from": ce.account.address,
                "nonce": ce.w3.eth.get_transaction_count(ce.account.address, "pending"),
                "gas": 700000,
                "maxFeePerGas": ce.w3.eth.gas_price,
                "maxPriorityFeePerGas": ce.w3.eth.max_priority_fee,
                "chainId": 8453,
            }
        )
        signed = ce.account.sign_transaction(tx)
        tx_hash = ce.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = ce.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=180)
        if receipt.status != 1:
            return None
        return tx_hash.hex()

    def _execute_arrakis(self, action: dict, target: LiquidityTarget) -> bool:
        ce = self.trader.contract_executor
        if not ce or not ce.w3:
            return False

        details = action["details"]
        vault_addr = Web3.to_checksum_address(target.config["vault"])
        resolver_addr = Web3.to_checksum_address(target.config["resolver"])

        token_a_sym = details["token_a"]
        token_b_sym = details["token_b"]
        amount_a = float(details["amount_a"])
        amount_b = float(details["amount_b"])

        spec_a = self._symbol_to_spec(token_a_sym, "base")
        spec_b = self._symbol_to_spec(token_b_sym, "base")
        if not spec_a or not spec_b:
            logger.error("arrakis_missing_token_spec token_a=%s token_b=%s", token_a_sym, token_b_sym)
            return False

        amount_a_raw = self._to_base_units(amount_a, spec_a.decimals)
        amount_b_raw = self._to_base_units(amount_b, spec_b.decimals)

        vault = ce.w3.eth.contract(address=vault_addr, abi=ARRAKIS_VAULT_ABI)
        resolver = ce.w3.eth.contract(address=resolver_addr, abi=ARRAKIS_RESOLVER_ABI)
        token0 = vault.functions.token0().call().lower()
        token1 = vault.functions.token1().call().lower()

        if spec_a.address.lower() == token0 and spec_b.address.lower() == token1:
            amount0_max, amount1_max = amount_a_raw, amount_b_raw
        elif spec_b.address.lower() == token0 and spec_a.address.lower() == token1:
            amount0_max, amount1_max = amount_b_raw, amount_a_raw
        else:
            logger.error("arrakis_token_mismatch target=%s", target.id)
            return False

        if not self.live_deploy:
            logger.info(
                "arrakis_deploy_dryrun target=%s vault=%s amount0=%s amount1=%s",
                target.id,
                vault_addr,
                amount0_max,
                amount1_max,
            )
            return True

        ce.approve_token(spec_a.address, vault_addr, amount_a_raw)
        ce.approve_token(spec_b.address, vault_addr, amount_b_raw)

        _, _, mint_amount = resolver.functions.getMintAmounts(vault_addr, amount0_max, amount1_max).call()
        if int(mint_amount) <= 0:
            logger.error("arrakis_zero_mint target=%s", target.id)
            return False

        tx_hash = self._build_and_send(vault.functions.mint(int(mint_amount), ce.account.address))
        return bool(tx_hash)

    def _execute_gamma(self, action: dict, target: LiquidityTarget) -> bool:
        ce = self.trader.contract_executor
        if not ce or not ce.w3:
            return False

        details = action["details"]
        manager_addr = Web3.to_checksum_address(target.config["manager"])

        token_a_sym = details["token_a"]
        token_b_sym = details["token_b"]
        amount_a = float(details["amount_a"])
        amount_b = float(details["amount_b"])

        token0_symbol = target.config.get("token0_symbol", token_a_sym)
        token1_symbol = target.config.get("token1_symbol", token_b_sym)

        spec0 = self._symbol_to_spec(token0_symbol, "base")
        spec1 = self._symbol_to_spec(token1_symbol, "base")
        spec_a = self._symbol_to_spec(token_a_sym, "base")
        spec_b = self._symbol_to_spec(token_b_sym, "base")
        if not spec0 or not spec1 or not spec_a or not spec_b:
            logger.error("gamma_missing_token_specs target=%s", target.id)
            return False

        amount_a_raw = self._to_base_units(amount_a, spec_a.decimals)
        amount_b_raw = self._to_base_units(amount_b, spec_b.decimals)

        if spec_a.symbol == spec0.symbol and spec_b.symbol == spec1.symbol:
            dep0, dep1 = amount_a_raw, amount_b_raw
        elif spec_b.symbol == spec0.symbol and spec_a.symbol == spec1.symbol:
            dep0, dep1 = amount_b_raw, amount_a_raw
        else:
            logger.error("gamma_token_order_mismatch target=%s", target.id)
            return False

        if not self.live_deploy:
            logger.info(
                "gamma_deploy_dryrun target=%s manager=%s dep0=%s dep1=%s",
                target.id,
                manager_addr,
                dep0,
                dep1,
            )
            return True

        ce.approve_token(spec0.address, manager_addr, dep0)
        ce.approve_token(spec1.address, manager_addr, dep1)

        manager = ce.w3.eth.contract(address=manager_addr, abi=GAMMA_MANAGER_ABI)
        tx_hash = self._build_and_send(manager.functions.deposit(dep0, dep1, ce.account.address, ce.account.address))
        return bool(tx_hash)

    def _execute_kamino(self, action: dict, target: LiquidityTarget) -> bool:
        details = action["details"]
        deposit_token = details.get("deposit_token") or details.get("token_a")
        amount = details.get("deposit_amount") or details.get("amount_a") or 0

        cmd = os.environ.get("KAMINO_DEPOSIT_CMD", "")
        if not cmd:
            # default to dry-run behavior
            logger.info(
                "kamino_deploy_dryrun target=%s strategy=%s deposit_token=%s amount=%s",
                target.id,
                target.config.get("strategy", ""),
                deposit_token,
                amount,
            )
            return True

        payload = {
            "strategy": target.config.get("strategy", ""),
            "deposit_token": deposit_token,
            "amount": float(amount),
            "slippage_bps": int(target.config.get("slippage_bps", 50)),
        }
        try:
            proc = subprocess.run(
                cmd.split(),
                input=json.dumps(payload),
                text=True,
                capture_output=True,
                timeout=180,
            )
            if proc.returncode != 0:
                logger.error("kamino_executor_failed rc=%s err=%s", proc.returncode, proc.stderr[:300])
                return False
            logger.info("kamino_executor_ok out=%s", proc.stdout[:300])
            return True
        except Exception as exc:
            logger.error("kamino_executor_exception %s", exc)
            return False

    def execute_deploy_action(self, action: dict) -> bool:
        opportunity_id = action.get("details", {}).get("opportunity_id", "")
        targets = self._load_targets()
        target = targets.get(opportunity_id)
        if not target:
            logger.warning("missing_liquidity_target opportunity_id=%s", opportunity_id)
            return False

        protocol = target.protocol.lower()
        if protocol == "arrakis":
            return self._execute_arrakis(action, target)
        if protocol == "gamma":
            return self._execute_gamma(action, target)
        if protocol == "kamino":
            return self._execute_kamino(action, target)

        logger.warning("unsupported_protocol protocol=%s", protocol)
        return False
