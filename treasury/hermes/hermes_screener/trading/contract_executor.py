#!/usr/bin/env python3
"""
Contract Executor: Direct on-chain interaction via Web3.py
Primary execution path for DEX swaps using ABI-encoded calldata.
Supports all working protocols across all verified chains.
Falls back to API-based execution when contract interaction isn't possible.
"""

import json
import logging
import time

from eth_account import Account
from web3 import Web3

from .protocol_registry import (
    ERC20_ABI,
    KYBER_ROUTER_ABI,
    NATIVE_ETH,
    PANCAKE_ROUTER_ABI,
    PROTOCOL_REGISTRY,
    SUSHI_ROUTER_ABI,
    UNIV3_QUOTER_ABI,
    UNIV3_ROUTER_ABI,
)

logger = logging.getLogger(__name__)

MAX_UINT256 = 2**256 - 1

# Load working protocols
import os as _os

_WP_PATH = _os.path.join(
    _os.path.dirname(_os.path.abspath(__file__)),
    "..",
    "..",
    "data",
    "working_protocols.json",
)
try:
    with open(_WP_PATH) as _f:
        WORKING_PROTOCOLS = json.load(_f)
except (FileNotFoundError, json.JSONDecodeError):
    WORKING_PROTOCOLS = {}

# RPC endpoints per chain
CHAIN_RPCS = {
    "ethereum": ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth"],
    "base": ["https://base.llamarpc.com", "https://base.drpc.org"],
    "arbitrum": ["https://arb1.arbitrum.io/rpc", "https://rpc.ankr.com/arbitrum"],
    "optimism": ["https://mainnet.optimism.io", "https://rpc.ankr.com/optimism"],
    "polygon": ["https://polygon-rpc.com", "https://rpc.ankr.com/polygon"],
    "bsc": ["https://bsc-dataseed.binance.org", "https://rpc.ankr.com/bsc"],
    "avalanche": [
        "https://api.avax.network/ext/bc/C/rpc",
        "https://rpc.ankr.com/avalanche",
    ],
    "gnosis": ["https://rpc.gnosischain.com", "https://gnosis-rpc.publicnode.com"],
    "celo": ["https://forno.celo.org"],
}

# Wrapped native tokens per chain
WRAPPED_NATIVE = {
    "ethereum": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "base": "0x4200000000000000000000000000000000000006",
    "arbitrum": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    "optimism": "0x4200000000000000000000000000000000000006",
    "polygon": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    "bsc": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    "avalanche": "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    "gnosis": "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
    "celo": "0x471EcE3750Da237f93B8E339c536989b8978a438",
}

# Stablecoins per chain
STABLECOINS = {
    "ethereum": {
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "DAI": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    },
    "base": {"USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"},
    "arbitrum": {
        "USDC": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        "USDT": "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    },
    "optimism": {"USDC": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"},
    "polygon": {"USDC": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"},
    "bsc": {"USDC": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"},
    "avalanche": {"USDC": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"},
}

# Minimal ABIs
V2_ROUTER_ABI = [
    {
        "type": "function",
        "name": "getAmountsOut",
        "stateMutability": "view",
        "inputs": [
            {"name": "amountIn", "type": "uint256"},
            {"name": "path", "type": "address[]"},
        ],
        "outputs": [{"name": "amounts", "type": "uint256[]"}],
    },
    {
        "type": "function",
        "name": "swapExactTokensForTokens",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "amountIn", "type": "uint256"},
            {"name": "amountOutMin", "type": "uint256"},
            {"name": "path", "type": "address[]"},
            {"name": "to", "type": "address"},
            {"name": "deadline", "type": "uint256"},
        ],
        "outputs": [{"name": "amounts", "type": "uint256[]"}],
    },
]

CURVE_POOL_ABI = [
    {
        "type": "function",
        "name": "get_dy",
        "stateMutability": "view",
        "inputs": [
            {"name": "i", "type": "int128"},
            {"name": "j", "type": "int128"},
            {"name": "dx", "type": "uint256"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "type": "function",
        "name": "exchange",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "i", "type": "int128"},
            {"name": "j", "type": "int128"},
            {"name": "dx", "type": "uint256"},
            {"name": "min_dy", "type": "uint256"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
    },
]

SUSHI_RP_ABI = [
    {
        "type": "function",
        "name": "processRoute",
        "stateMutability": "payable",
        "inputs": [
            {"name": "tokenIn", "type": "address"},
            {"name": "amountIn", "type": "uint256"},
            {"name": "tokenOut", "type": "address"},
            {"name": "amountOutMin", "type": "uint256"},
            {"name": "to", "type": "address"},
            {"name": "route", "type": "bytes"},
        ],
        "outputs": [{"name": "amountOut", "type": "uint256"}],
    }
]


class ContractExecutor:
    """Direct contract interaction for DEX swaps via Web3.py. Multi-chain support."""

    def __init__(self, w3: Web3, account: Account):
        self.w3 = w3
        self.account = account
        self._token_contracts = {}
        self._chain_w3 = {}  # cache Web3 per chain

    def get_chain_web3(self, chain: str) -> Web3 | None:
        """Get Web3 connection for any supported chain."""
        if chain in self._chain_w3:
            return self._chain_w3[chain]

        rpcs = CHAIN_RPCS.get(chain, [])
        for rpc in rpcs:
            try:
                w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 8}))
                if w3.is_connected():
                    self._chain_w3[chain] = w3
                    return w3
            except Exception:
                continue
        return None

    # ==================== ERC-20 OPERATIONS ====================

    def get_token_contract(self, token_addr: str):
        """Get cached ERC-20 contract instance."""
        if token_addr not in self._token_contracts:
            self._token_contracts[token_addr] = self.w3.eth.contract(
                address=Web3.to_checksum_address(token_addr), abi=ERC20_ABI
            )
        return self._token_contracts[token_addr]

    def get_token_balance(self, token_addr: str, wallet: str = None) -> int:
        """Get ERC-20 token balance in base units."""
        wallet = wallet or self.account.address
        if token_addr == NATIVE_ETH:
            return self.w3.eth.get_balance(Web3.to_checksum_address(wallet))
        contract = self.get_token_contract(token_addr)
        try:
            return contract.functions.balanceOf(Web3.to_checksum_address(wallet)).call()
        except Exception as e:
            logger.warning(f"Balance check failed (RPC issue?): {e}")
            return 0

    def get_token_decimals(self, token_addr: str) -> int:
        """Get token decimals."""
        if token_addr == NATIVE_ETH:
            return 18
        contract = self.get_token_contract(token_addr)
        return contract.functions.decimals().call()

    def get_allowance(self, token_addr: str, spender: str) -> int:
        """Check current allowance."""
        contract = self.get_token_contract(token_addr)
        return contract.functions.allowance(
            Web3.to_checksum_address(self.account.address),
            Web3.to_checksum_address(spender),
        ).call()

    def approve_token(self, token_addr: str, spender: str, amount: int = None) -> str | None:
        """Approve token spending. Returns tx_hash or None."""
        if amount is None:
            amount = MAX_UINT256

        contract = self.get_token_contract(token_addr)
        current = self.get_allowance(token_addr, spender)
        if current >= amount:
            logger.info(f"Allowance sufficient: {current} >= {amount}")
            return "already_approved"

        try:
            tx = contract.functions.approve(Web3.to_checksum_address(spender), amount).build_transaction(
                {
                    "from": self.account.address,
                    "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
                    "gas": 60000,
                    "maxFeePerGas": self.w3.eth.gas_price,
                    "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                    "chainId": 8453,
                }
            )

            signed = self.account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"Approve tx sent: {tx_hash.hex()}")

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            if receipt.status == 1:
                logger.info(f"Approve confirmed: {tx_hash.hex()}")
                return tx_hash.hex()
            else:
                logger.error(f"Approve failed: {tx_hash.hex()}")
                return None
        except Exception as e:
            logger.error(f"Approve error: {e}")
            return None

    # ==================== SIMULATION ====================

    def simulate_tx(self, tx: dict) -> tuple[bool, str]:
        """Simulate a transaction to check for reverts. Returns (success, revert_reason)."""
        try:
            self.w3.eth.call(tx, tx.get("block", "latest"))
            return True, ""
        except Exception as e:
            reason = str(e)
            # Extract revert reason if present
            if "execution reverted:" in reason:
                reason = reason.split("execution reverted:")[-1].strip()
            elif "revert" in reason.lower():
                pass  # keep full message
            return False, reason

    # ==================== UNISWAP V3 ====================

    def quote_univ3(self, token_in: str, token_out: str, amount_in: int, fee: int = 3000) -> int:
        """Get quote from Uniswap V3 QuoterV2 (view function, free)."""
        chain_cfg = PROTOCOL_REGISTRY["base"]["uniswap_v3"]
        quoter = self.w3.eth.contract(address=Web3.to_checksum_address(chain_cfg["quoter"]), abi=UNIV3_QUOTER_ABI)

        # Wrap native ETH for quoting
        t_in = token_in if token_in != NATIVE_ETH else chain_cfg["native_wrap"]
        t_out = token_out if token_out != NATIVE_ETH else chain_cfg["native_wrap"]

        try:
            result = quoter.functions.quoteExactInputSingle(
                (
                    Web3.to_checksum_address(t_in),
                    Web3.to_checksum_address(t_out),
                    amount_in,
                    fee,
                    0,  # sqrtPriceLimitX96
                )
            ).call()
            return result[0]  # amountOut
        except Exception as e:
            logger.debug(f"UniV3 quote failed (fee={fee}): {e}")
            return 0

    def swap_univ3(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_out: int,
        fee: int = 3000,
    ) -> str | None:
        """Execute swap on Uniswap V3 via SwapRouter. Returns tx_hash or None."""
        chain_cfg = PROTOCOL_REGISTRY["base"]["uniswap_v3"]
        router = self.w3.eth.contract(address=Web3.to_checksum_address(chain_cfg["router"]), abi=UNIV3_ROUTER_ABI)

        t_in = token_in if token_in != NATIVE_ETH else chain_cfg["native_wrap"]
        t_out = token_out if token_out != NATIVE_ETH else chain_cfg["native_wrap"]
        is_native_in = token_in == NATIVE_ETH
        is_native_out = token_out == NATIVE_ETH

        # Approve if ERC-20 input
        if not is_native_in:
            self.approve_token(t_in, chain_cfg["router"], amount_in)

        deadline = int(time.time()) + 300

        params = (
            Web3.to_checksum_address(t_in),
            Web3.to_checksum_address(t_out),
            fee,
            Web3.to_checksum_address(self.account.address),
            deadline,
            amount_in,
            min_out,
            0,  # sqrtPriceLimitX96
        )

        try:
            tx = router.functions.exactInputSingle(params).build_transaction(
                {
                    "from": self.account.address,
                    "value": amount_in if is_native_in else 0,
                    "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
                    "gas": 300000,
                    "maxFeePerGas": self.w3.eth.gas_price,
                    "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                    "chainId": 8453,
                }
            )

            # Simulate first
            sim_ok, sim_reason = self.simulate_tx(tx)
            if not sim_ok:
                logger.error(f"UniV3 simulation failed: {sim_reason}")
                return None

            signed = self.account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"UniV3 swap sent: {tx_hash.hex()}")

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status == 1:
                logger.info(f"UniV3 swap confirmed: {tx_hash.hex()}")
                return tx_hash.hex()
            else:
                logger.error(f"UniV3 swap reverted: {tx_hash.hex()}")
                return None
        except Exception as e:
            logger.error(f"UniV3 swap error: {e}")
            return None

    # ==================== PANCAKESWAP ====================

    def swap_pancake(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_out: int,
        fee: int = 2500,
    ) -> str | None:
        """Execute swap on PancakeSwap V3."""
        chain_cfg = PROTOCOL_REGISTRY["base"]["pancakeswap"]
        router = self.w3.eth.contract(
            address=Web3.to_checksum_address(chain_cfg["v3_router"]),
            abi=PANCAKE_ROUTER_ABI,
        )

        t_in = token_in if token_in != NATIVE_ETH else chain_cfg["native_wrap"]
        t_out = token_out if token_out != NATIVE_ETH else chain_cfg["native_wrap"]
        is_native_in = token_in == NATIVE_ETH

        if not is_native_in:
            self.approve_token(t_in, chain_cfg["v3_router"], amount_in)

        deadline = int(time.time()) + 300
        params = (
            Web3.to_checksum_address(t_in),
            Web3.to_checksum_address(t_out),
            fee,
            Web3.to_checksum_address(self.account.address),
            deadline,
            amount_in,
            min_out,
            0,
        )

        try:
            tx = router.functions.exactInputSingle(params).build_transaction(
                {
                    "from": self.account.address,
                    "value": amount_in if is_native_in else 0,
                    "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
                    "gas": 300000,
                    "maxFeePerGas": self.w3.eth.gas_price,
                    "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                    "chainId": 8453,
                }
            )

            sim_ok, sim_reason = self.simulate_tx(tx)
            if not sim_ok:
                logger.error(f"Pancake simulation failed: {sim_reason}")
                return None

            signed = self.account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"Pancake swap sent: {tx_hash.hex()}")

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status == 1:
                logger.info(f"Pancake swap confirmed: {tx_hash.hex()}")
                return tx_hash.hex()
            else:
                logger.error(f"Pancake swap reverted: {tx_hash.hex()}")
                return None
        except Exception as e:
            logger.error(f"Pancake swap error: {e}")
            return None

    # ==================== SUSHISWAP ====================

    def swap_sushi(self, token_in: str, token_out: str, amount_in: int, min_out: int) -> str | None:
        """Execute swap on SushiSwap RouteProcessor4."""
        chain_cfg = PROTOCOL_REGISTRY["base"]["sushiswap"]
        router = self.w3.eth.contract(address=Web3.to_checksum_address(chain_cfg["router"]), abi=SUSHI_ROUTER_ABI)

        t_in = token_in if token_in != NATIVE_ETH else chain_cfg["native_wrap"]
        t_out = token_out if token_out != NATIVE_ETH else chain_cfg["native_wrap"]
        is_native_in = token_in == NATIVE_ETH

        if not is_native_in:
            self.approve_token(t_in, chain_cfg["router"], amount_in)

        # Sushi RouteProcessor4 uses processRoute with a route bytes param
        # For simple swaps, route can be empty (it auto-routes)
        try:
            tx = router.functions.processRoute(
                Web3.to_checksum_address(t_in),
                amount_in,
                Web3.to_checksum_address(t_out),
                min_out,
                Web3.to_checksum_address(self.account.address),
                b"",  # empty route = auto-route
            ).build_transaction(
                {
                    "from": self.account.address,
                    "value": amount_in if is_native_in else 0,
                    "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
                    "gas": 300000,
                    "maxFeePerGas": self.w3.eth.gas_price,
                    "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                    "chainId": 8453,
                }
            )

            sim_ok, sim_reason = self.simulate_tx(tx)
            if not sim_ok:
                logger.error(f"Sushi simulation failed: {sim_reason}")
                return None

            signed = self.account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"Sushi swap sent: {tx_hash.hex()}")

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status == 1:
                logger.info(f"Sushi swap confirmed: {tx_hash.hex()}")
                return tx_hash.hex()
            else:
                logger.error(f"Sushi swap reverted: {tx_hash.hex()}")
                return None
        except Exception as e:
            logger.error(f"Sushi swap error: {e}")
            return None

    # ==================== AGGREGATOR EXECUTION ====================

    def execute_aggregator_tx(self, protocol: str, tx_data: dict, value: int = 0) -> str | None:
        """Execute a pre-built aggregator transaction (KyberSwap, Odos, Velora).
        tx_data should have: 'to', 'data', 'gas' (optional)"""
        try:
            tx = {
                "from": self.account.address,
                "to": Web3.to_checksum_address(tx_data["to"]),
                "data": tx_data["data"],
                "value": value,
                "nonce": self.w3.eth.get_transaction_count(self.account.address, "pending"),
                "gas": int(tx_data.get("gas", 300000)),
                "maxFeePerGas": self.w3.eth.gas_price,
                "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                "chainId": 8453,
            }

            # Simulate
            sim_ok, sim_reason = self.simulate_tx(tx)
            if not sim_ok:
                logger.error(f"{protocol} simulation failed: {sim_reason}")
                return None

            signed = self.account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"{protocol} swap sent: {tx_hash.hex()}")

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status == 1:
                logger.info(f"{protocol} swap confirmed: {tx_hash.hex()}")
                return tx_hash.hex()
            else:
                logger.error(f"{protocol} swap reverted: {tx_hash.hex()}")
                return None
        except Exception as e:
            logger.error(f"{protocol} execution error: {e}")
            return None

    # ==================== BEST QUOTE FINDER ====================

    def find_best_quote(self, token_in: str, token_out: str, amount_in: int, chain: str = "base") -> dict:
        """Find best quote across all direct-contract protocols.
        Returns: {protocol: amount_out, ...} sorted by best output."""
        quotes = {}

        if chain != "base":
            return quotes  # Solana uses API path

        # Uniswap V3: try all fee tiers
        best_uni = 0
        best_fee = 3000
        for fee in [500, 3000, 10000]:
            out = self.quote_univ3(token_in, token_out, amount_in, fee)
            if out > best_uni:
                best_uni = out
                best_fee = fee
        if best_uni > 0:
            quotes["uniswap_v3"] = {"output": best_uni, "fee": best_fee}

        # Note: KyberSwap, Odos, Velora need API for quotes
        # (their on-chain routers don't have view quote functions)
        # PancakeSwap and SushiSwap don't have reliable on-chain quoter on Base

        return quotes

    # ==================== SMART SWAP ====================

    def smart_swap(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        slippage_bps: int = 100,
        chain: str = "base",
        preferred_protocol: str = None,
    ) -> str | None:
        """
        Execute swap using best available method:
        1. Direct contract call (UniV3, Pancake, Sushi) if quote available
        2. Aggregator tx (KyberSwap, Odos, Velora) with pre-built calldata
        3. Falls back to API-based execution

        Returns tx_hash or None.
        """
        if chain != "base":
            logger.warning("Direct contract swap only supported on Base EVM")
            return None

        is_native_in = token_in == NATIVE_ETH

        # Check balance
        balance = self.get_token_balance(token_in)
        if balance < amount_in:
            logger.error(f"Insufficient balance: {balance} < {amount_in}")
            return None

        # === Protocol 1: Uniswap V3 (direct contract, has on-chain quoter) ===
        if not preferred_protocol or preferred_protocol == "uniswap_v3":
            logger.info("Trying Uniswap V3 (direct contract)...")
            best_out = 0
            best_fee = 3000
            for fee in [500, 3000, 10000]:
                out = self.quote_univ3(token_in, token_out, amount_in, fee)
                if out > best_out:
                    best_out = out
                    best_fee = fee

            if best_out > 0:
                min_out = int(best_out * (10000 - slippage_bps) / 10000)
                logger.info(f"UniV3 best: fee={best_fee}, out={best_out}, min_out={min_out}")
                result = self.swap_univ3(token_in, token_out, amount_in, min_out, best_fee)
                if result:
                    return result
                logger.warning("UniV3 swap failed, trying next protocol...")

        # === Protocol 2: PancakeSwap V3 (direct contract) ===
        if not preferred_protocol or preferred_protocol == "pancakeswap":
            logger.info("Trying PancakeSwap V3 (direct contract)...")
            # Pancake doesn't have on-chain quoter on Base, estimate from UniV3
            est_out = self.quote_univ3(token_in, token_out, amount_in, 2500)  # 0.25% tier
            if est_out > 0:
                min_out = int(est_out * (10000 - slippage_bps) / 10000)
                result = self.swap_pancake(token_in, token_out, amount_in, min_out)
                if result:
                    return result

        # === Protocol 3: SushiSwap (direct contract) ===
        if not preferred_protocol or preferred_protocol == "sushiswap":
            logger.info("Trying SushiSwap (direct contract)...")
            est_out = self.quote_univ3(token_in, token_out, amount_in, 3000)
            if est_out > 0:
                min_out = int(est_out * (10000 - slippage_bps) / 10000)
                result = self.swap_sushi(token_in, token_out, amount_in, min_out)
                if result:
                    return result

        logger.error("All direct contract methods failed")
        return None

    # ==================== KYBERSWAP CONTRACT ====================

    def swap_kyber(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        min_out: int,
        api_calldata: dict,
    ) -> str | None:
        """Execute KyberSwap via direct contract call using API-assembled calldata."""
        chain_cfg = PROTOCOL_REGISTRY["base"]["kyberswap"]
        router = self.w3.eth.contract(address=Web3.to_checksum_address(chain_cfg["router"]), abi=KYBER_ROUTER_ABI)

        is_native = token_in == NATIVE_ETH
        if not is_native:
            self.approve_token(token_in, chain_cfg["router"], amount_in)

        # KyberSwap API returns calldata directly - use execute_aggregator_tx
        return self.execute_aggregator_tx("KyberSwap", api_calldata, value=amount_in if is_native else 0)

    # ==================== PARASWAP V6 CONTRACT ====================

    PARASWAP_V6_ABI = [
        {
            "type": "function",
            "name": "swapExactAmountIn",
            "stateMutability": "payable",
            "inputs": [
                {"name": "executor", "type": "address"},
                {
                    "name": "swapData",
                    "type": "tuple",
                    "components": [
                        {"name": "srcToken", "type": "address"},
                        {"name": "destToken", "type": "address"},
                        {"name": "srcAmount", "type": "uint256"},
                        {"name": "destAmount", "type": "uint256"},
                        {"name": "expectedAmount", "type": "uint256"},
                        {"name": "callees", "type": "bytes"},
                        {"name": "exchangeData", "type": "bytes"},
                        {"name": "startIndexes", "type": "uint256[]"},
                        {"name": "values", "type": "uint256[]"},
                        {"name": "beneficiary", "type": "address"},
                        {"name": "partner", "type": "address"},
                        {"name": "feePercent", "type": "uint256"},
                        {"name": "permit", "type": "bytes"},
                        {"name": "deadline", "type": "uint256"},
                    ],
                },
                {"name": "partnerAndFee", "type": "uint256"},
                {"name": "permit", "type": "bytes"},
                {"name": "executorData", "type": "bytes"},
            ],
            "outputs": [{"name": "receivedAmount", "type": "uint256"}],
        },
    ]

    def swap_paraswap_v6(self, token_in: str, token_out: str, amount_in: int, min_out: int, api_tx: dict) -> str | None:
        """Execute ParaSwap V6 via direct contract. API provides route data."""
        router_addr = "0x6a000f20005980200259b80c5102003040001068"
        is_native = token_in == NATIVE_ETH
        if not is_native:
            self.approve_token(token_in, router_addr, amount_in)

        # ParaSwap API returns the full calldata
        return self.execute_aggregator_tx("ParaSwapV6", api_tx, value=amount_in if is_native else 0)

    # ==================== 1INCH V6 CONTRACT ====================

    ONEINCH_V6_ABI = [
        {
            "type": "function",
            "name": "unoswap",
            "stateMutability": "payable",
            "inputs": [
                {"name": "srcToken", "type": "address"},
                {"name": "amount", "type": "uint256"},
                {"name": "minReturn", "type": "uint256"},
                {"name": "pools", "type": "uint256[]"},
            ],
            "outputs": [{"name": "returnAmount", "type": "uint256"}],
        },
        {
            "type": "function",
            "name": "unoswapTo",
            "stateMutability": "payable",
            "inputs": [
                {"name": "recipient", "type": "address"},
                {"name": "srcToken", "type": "address"},
                {"name": "amount", "type": "uint256"},
                {"name": "minReturn", "type": "uint256"},
                {"name": "pools", "type": "uint256[]"},
            ],
            "outputs": [{"name": "returnAmount", "type": "uint256"}],
        },
        {
            "type": "function",
            "name": "swap",
            "stateMutability": "payable",
            "inputs": [
                {"name": "executor", "type": "address"},
                {
                    "name": "desc",
                    "type": "tuple",
                    "components": [
                        {"name": "srcToken", "type": "address"},
                        {"name": "dstToken", "type": "address"},
                        {"name": "srcReceiver", "type": "address"},
                        {"name": "dstReceiver", "type": "address"},
                        {"name": "amount", "type": "uint256"},
                        {"name": "minReturnAmount", "type": "uint256"},
                        {"name": "flags", "type": "uint256"},
                    ],
                },
                {"name": "permit", "type": "bytes"},
                {"name": "data", "type": "bytes"},
            ],
            "outputs": [{"name": "returnAmount", "type": "uint256"}],
        },
    ]

    def swap_1inch_v6(self, token_in: str, token_out: str, amount_in: int, min_out: int, api_tx: dict) -> str | None:
        """Execute 1inch V6 via direct contract. API provides route calldata."""
        router_addr = "0x1111111254EEB25477B68fb85Ed929f73A960582"
        is_native = token_in == NATIVE_ETH
        if not is_native:
            self.approve_token(token_in, router_addr, amount_in)

        return self.execute_aggregator_tx("1inchV6", api_tx, value=amount_in if is_native else 0)

    # ==================== SMART SWAP (UPDATED) ====================

    def smart_swap(
        self,
        token_in: str,
        token_out: str,
        amount_in: int,
        slippage_bps: int = 100,
        chain: str = "base",
        preferred_protocol: str = None,
        api_routes: dict = None,
    ) -> str | None:
        """
        Execute swap with priority ordering:
        1. Direct on-chain AMMs (UniV3, Pancake, Sushi) - full on-chain
        2. Aggregator contracts (KyberSwap, 1inch, ParaSwap) - API route + contract exec
        3. Falls back to API-only execution in dex_aggregator_trader

        Args:
            api_routes: dict of {protocol: {"to":addr, "data":hex, "gas":int, "value":int}}
                        from compare_quotes() for aggregator protocols
        """
        if chain != "base":
            logger.warning("Direct contract swap only supported on Base EVM")
            return None

        is_native_in = token_in == NATIVE_ETH
        balance = self.get_token_balance(token_in)
        if balance < amount_in:
            logger.error(f"Insufficient balance: {balance} < {amount_in}")
            return None

        api_routes = api_routes or {}

        # === TIER 1: Direct on-chain AMMs (no API needed) ===
        if not preferred_protocol or preferred_protocol in (
            "uniswap_v3",
            "pancakeswap",
            "sushiswap",
        ):
            # UniV3
            if not preferred_protocol or preferred_protocol == "uniswap_v3":
                best_out, best_fee = 0, 3000
                for fee in [500, 3000, 10000]:
                    out = self.quote_univ3(token_in, token_out, amount_in, fee)
                    if out > best_out:
                        best_out, best_fee = out, fee
                if best_out > 0:
                    min_out = int(best_out * (10000 - slippage_bps) / 10000)
                    logger.info(f"[UniV3] fee={best_fee} out={best_out} min={min_out}")
                    result = self.swap_univ3(token_in, token_out, amount_in, min_out, best_fee)
                    if result:
                        return result

            # Pancake
            if not preferred_protocol or preferred_protocol == "pancakeswap":
                est = self.quote_univ3(token_in, token_out, amount_in, 2500)
                if est > 0:
                    min_out = int(est * (10000 - slippage_bps) / 10000)
                    logger.info(f"[Pancake] est_out={est} min={min_out}")
                    result = self.swap_pancake(token_in, token_out, amount_in, min_out)
                    if result:
                        return result

            # Sushi
            if not preferred_protocol or preferred_protocol == "sushiswap":
                est = self.quote_univ3(token_in, token_out, amount_in, 3000)
                if est > 0:
                    min_out = int(est * (10000 - slippage_bps) / 10000)
                    logger.info(f"[Sushi] est_out={est} min={min_out}")
                    result = self.swap_sushi(token_in, token_out, amount_in, min_out)
                    if result:
                        return result

        # === TIER 2: Aggregator contracts (API provides route, we execute on-chain) ===
        for proto in ["kyberswap", "1inch", "paraswap"]:
            if preferred_protocol and preferred_protocol != proto:
                continue
            if proto in api_routes:
                route = api_routes[proto]
                logger.info(f"[{proto}] executing via contract...")
                result = self.execute_aggregator_tx(
                    proto,
                    {
                        "to": route.get("to"),
                        "data": route.get("data"),
                        "gas": route.get("gas", 300000),
                    },
                    value=amount_in if is_native_in else 0,
                )
                if result:
                    return result

        logger.error("All contract methods failed")
        return None

    # ==================== MULTI-CHAIN QUOTES ====================

    def quote_all_chains(self, token_in_symbol: str, token_out_symbol: str, amount_wei: int) -> dict:
        """Get quotes across all working chains and DEXes."""
        results = {}

        dex_protocols = WORKING_PROTOCOLS.get("dex_contracts", {})
        for chain, routers in dex_protocols.items():
            chain_w3 = self.get_chain_web3(chain)
            if not chain_w3:
                continue

            weth = WRAPPED_NATIVE.get(chain)
            stables = STABLECOINS.get(chain, {})
            usdc = stables.get("USDC")
            if not weth or not usdc:
                continue

            for proto_name, info in routers.items():
                addr = info["addr"]
                ptype = info["type"]

                try:
                    if ptype == "v2_router":
                        c = chain_w3.eth.contract(address=Web3.to_checksum_address(addr), abi=V2_ROUTER_ABI)
                        r = c.functions.getAmountsOut(
                            amount_wei,
                            [
                                Web3.to_checksum_address(weth),
                                Web3.to_checksum_address(usdc),
                            ],
                        ).call()
                        results[f"{chain}/{proto_name}"] = {
                            "output": r[1],
                            "chain": chain,
                        }

                    elif ptype == "v3_quoter":
                        c = chain_w3.eth.contract(address=Web3.to_checksum_address(addr), abi=UNIV3_QUOTER_ABI)
                        r = c.functions.quoteExactInputSingle(
                            (
                                Web3.to_checksum_address(weth),
                                Web3.to_checksum_address(usdc),
                                amount_wei,
                                3000,
                                0,
                            )
                        ).call()
                        results[f"{chain}/{proto_name}"] = {
                            "output": r[0],
                            "chain": chain,
                        }

                    elif ptype == "curve":
                        c = chain_w3.eth.contract(address=Web3.to_checksum_address(addr), abi=CURVE_POOL_ABI)
                        r = c.functions.get_dy(1, 2, amount_wei // 10**12).call()
                        results[f"{chain}/{proto_name}"] = {"output": r, "chain": chain}

                except Exception as e:
                    logger.debug(f"Quote failed {chain}/{proto_name}: {str(e)[:40]}")

        return results

    def best_quote_across_chains(self, chain: str, token_in: str, token_out: str, amount_in: int) -> tuple[str, int]:
        """Find best quote on a specific chain across all DEXes."""
        chain_w3 = self.get_chain_web3(chain)
        if not chain_w3:
            return "", 0

        best_output = 0
        best_dex = ""

        dex_protocols = WORKING_PROTOCOLS.get("dex_contracts", {})
        routers = dex_protocols.get(chain, {})

        for proto_name, info in routers.items():
            addr = info["addr"]
            ptype = info["type"]

            try:
                if ptype == "v2_router":
                    c = chain_w3.eth.contract(address=Web3.to_checksum_address(addr), abi=V2_ROUTER_ABI)
                    r = c.functions.getAmountsOut(
                        amount_in,
                        [
                            Web3.to_checksum_address(token_in),
                            Web3.to_checksum_address(token_out),
                        ],
                    ).call()
                    if r[1] > best_output:
                        best_output = r[1]
                        best_dex = proto_name

                elif ptype == "v3_quoter":
                    c = chain_w3.eth.contract(address=Web3.to_checksum_address(addr), abi=UNIV3_QUOTER_ABI)
                    for fee in [500, 3000, 10000]:
                        try:
                            r = c.functions.quoteExactInputSingle(
                                (
                                    Web3.to_checksum_address(token_in),
                                    Web3.to_checksum_address(token_out),
                                    amount_in,
                                    fee,
                                    0,
                                )
                            ).call()
                            if r[0] > best_output:
                                best_output = r[0]
                                best_dex = f"{proto_name}(fee={fee})"
                        except Exception:
                            continue

                elif ptype == "sushi_rp":
                    c = chain_w3.eth.contract(address=Web3.to_checksum_address(addr), abi=SUSHI_RP_ABI)
                    r = c.functions.processRoute(
                        Web3.to_checksum_address(token_in),
                        amount_in,
                        Web3.to_checksum_address(token_out),
                        0,
                        Web3.to_checksum_address(self.account.address),
                        b"",
                    ).call({"from": self.account.address})
                    if r > best_output:
                        best_output = r
                        best_dex = proto_name

            except Exception as e:
                logger.debug(f"Best quote failed {proto_name}: {str(e)[:40]}")

        return best_dex, best_output
