#!/usr/bin/env python3
"""
DEX Aggregator Trading Bot
Uses multiple DEX aggregators for optimal trading across Base and Solana.
"""

import logging
import os
import sys
import time
from decimal import Decimal

import requests
from dotenv import load_dotenv
from eth_account import Account

import atexit
from hermes_screener import tor_config  # noqa: F401
from web3 import Web3

load_dotenv(os.path.expanduser("~/.hermes/.env"))

# === SINGLE INSTANCE LOCK ===
LOCKFILE = "/tmp/dex_aggregator_trader.lock"


def acquire_lock():
    """Acquire exclusive lock via PID-based lockfile. Exit if another instance is running."""

    if os.path.exists(LOCKFILE):
        try:
            with open(LOCKFILE) as f:
                old_pid = int(f.read().strip())
            os.kill(old_pid, 0)  # signal 0 = check existence
            print(
                f"[LOCK] Instance already running (PID {old_pid}), exiting.",
                file=sys.stderr,
            )
            sys.exit(0)
        except (ValueError, ProcessLookupError):
            # Stale lockfile or PID doesn't exist -- take over
            print("[LOCK] Stale lockfile found, taking over.", file=sys.stderr)
        except PermissionError:
            # Process exists but we can't signal it (different user) -- exit safe
            print(
                f"[LOCK] Instance running (PID {old_pid}, permission denied), exiting.",
                file=sys.stderr,
            )
            sys.exit(0)

    with open(LOCKFILE, "w") as f:
        f.write(str(os.getpid()))


def release_lock():
    """Remove lockfile if we own it."""
    try:
        with open(LOCKFILE) as f:
            pid = int(f.read().strip())
        if pid == os.getpid():
            os.remove(LOCKFILE)
    except (FileNotFoundError, ValueError):
        pass



logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Import contract executor (direct on-chain calls)
try:
    from .contract_executor import ContractExecutor
    from .protocol_registry import NATIVE_ETH

    HAS_CONTRACT_EXECUTOR = True
except ImportError:
    HAS_CONTRACT_EXECUTOR = False
    NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"

# Import Solana program adapter
try:
    from solana_adapter import SolanaProgramAdapter

    HAS_SOLANA_ADAPTER = True
except ImportError:
    HAS_SOLANA_ADAPTER = False


class DexAggregatorTrader:
    """
    Multi-chain trading using DEX aggregators.
    Supports: Jupiter, KyberSwap, OpenOcean, LiFi, Velora, Portals.fi, Enso, Oku
    """

    # API Keys
    LIFI_API_KEY = os.environ.get(
        "LIFI_API_KEY",
        "5507bdb8-0e83-4f80-8c76-238718004832.d1d06e6b-5be9-4725-93b5-75e62b90ccd4",
    )
    JUPITER_API_KEY = os.environ.get(
        "JUPITER_API_KEY",
        "jup_92630f2f0da7d0cc8923a674bd54252f958a103c237de78da89ba6a0494117d9",
    )
    PORTALS_BEARER = "04a791c6-7f56-4bcc-b0fd-a00cc0157cde"

    # API Endpoints
    JUPITER_API = "https://quote-api.jup.ag/v6"
    JUPITER_API_V1 = "https://api.jup.ag/swap/v1"
    KYBERSWAP_API = "https://aggregator-api.kyberswap.com"
    OPENOCEAN_API = "https://open-api.openocean.finance/v3"
    LIFI_API = "https://li.quest/v1"
    VELORA_API = "https://api.paraswap.io"
    PORTALS_API = "https://api.portals.fi/v2"
    ENSO_API = "https://api.enso.build/api/v1"
    OKU_API = "https://api.oku.trade"
    ODOS_API = "https://api.odos.xyz"
    COW_API = "https://api.cow.fi/base"
    RAYDIUM_API = "https://transaction-v1.raydium.io"
    GMX_API = "https://arbitrum-api.gmxinfra.io"

    def __init__(self):
        self.evm_account = None
        self.solana_keypair = None
        self.w3 = None
        self.contract_executor = None
        self.solana_adapter = None
        self._enso_rate_limited = False
        self.initialize()

    def initialize(self):
        """Initialize wallets."""
        try:
            # EVM wallet
            evm_pk = os.environ.get("WALLET_PRIVATE_KEY_BASE", "")
            if evm_pk:
                if evm_pk.startswith("0x"):
                    evm_pk = evm_pk[2:]
                self.evm_account = Account.from_key(bytes.fromhex(evm_pk))
                logger.info(f"EVM Wallet: {self.evm_account.address}")

            # Solana wallet
            solana_pk = os.environ.get("WALLET_PRIVATE_KEY_SOLANA") or os.environ.get("SOLANA_PRIVATE_KEY", "")
            if solana_pk:
                try:
                    from solders.keypair import Keypair

                    if len(solana_pk) == 64:
                        try:
                            self.solana_keypair = Keypair.from_base58_string(solana_pk)
                        except Exception:
                            self.solana_keypair = Keypair.from_seed(bytes.fromhex(solana_pk[:64]))
                    elif len(solana_pk) in [87, 88]:
                        self.solana_keypair = Keypair.from_base58_string(solana_pk)
                    if self.solana_keypair:
                        logger.info(f"Solana Wallet: {self.solana_keypair.pubkey()}")

                    # Initialize Solana program adapter
                    if HAS_SOLANA_ADAPTER:
                        try:
                            self.solana_adapter = SolanaProgramAdapter(
                                rpc_url=os.environ.get(
                                    "SOLANA_RPC_URL",
                                    "https://api.mainnet-beta.solana.com",
                                ),
                                private_key=solana_pk,
                            )
                            logger.info("Solana program adapter initialized (direct program mode)")
                        except Exception as e:
                            logger.warning(f"Solana adapter init failed: {e}")
                except Exception as e:
                    logger.error(f"Solana wallet error: {e}")

            # Web3 for EVM
            if self.evm_account:
                self.w3 = self.get_web3()

                # Initialize contract executor for direct on-chain calls
                if HAS_CONTRACT_EXECUTOR and self.w3:
                    try:
                        self.contract_executor = ContractExecutor(self.w3, self.evm_account)
                        logger.info("Contract executor initialized (direct on-chain mode)")
                    except Exception as e:
                        logger.warning(f"Contract executor init failed: {e}")

            logger.info("DEX Aggregator Trader initialized")

        except Exception as e:
            logger.error(f"Initialization failed: {e}")
            raise

    def get_web3(self) -> Web3 | None:
        """Get Web3 connection."""
        rpcs = [
            "https://mainnet.base.org",
            "https://base.llamarpc.com",
            "https://base.drpc.org",
        ]
        for rpc in rpcs:
            try:
                w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 10}))
                if w3.is_connected():
                    return w3
            except Exception:
                continue
        return None

    # ==================== JUPITER (Solana) ====================

    def jupiter_quote(self, input_mint: str, output_mint: str, amount: int, slippage_bps: int = 50) -> dict:
        """Get quote from Jupiter."""
        try:
            resp = requests.get(
                f"{self.JUPITER_API}/quote",
                params={
                    "inputMint": input_mint,
                    "outputMint": output_mint,
                    "amount": str(amount),
                    "slippageBps": slippage_bps,
                },
                headers={"x-api-key": self.JUPITER_API_KEY},
                timeout=10,
            )
            return resp.json()
        except Exception as e:
            logger.error(f"Jupiter quote error: {e}")
            return {}

    def jupiter_swap(self, quote: dict, wallet: str) -> dict:
        """Execute swap on Jupiter."""
        try:
            resp = requests.post(
                f"{self.JUPITER_API}/swap",
                json={
                    "quoteResponse": quote,
                    "userPublicKey": wallet,
                    "wrapAndUnwrapSol": True,
                },
                headers={"x-api-key": self.JUPITER_API_KEY},
                timeout=30,
            )
            return resp.json()
        except Exception as e:
            logger.error(f"Jupiter swap error: {e}")
            return {}

    # ==================== KYBERSWAP (EVM) ====================

    def kyberswap_quote(self, chain: str, token_in: str, token_out: str, amount: str) -> dict:
        """Get quote from KyberSwap."""
        chain_ids = {
            "base": "base",
            "ethereum": "ethereum",
            "arbitrum": "arbitrum",
            "polygon": "polygon",
            "bsc": "bsc",
        }
        chain_id = chain_ids.get(chain, "base")
        try:
            resp = requests.get(
                f"{self.KYBERSWAP_API}/{chain_id}/api/v1/routes",
                params={
                    "tokenIn": token_in,
                    "tokenOut": token_out,
                    "amountIn": amount,
                },
                timeout=10,
            )
            return resp.json()
        except Exception as e:
            logger.error(f"KyberSwap quote error: {e}")
            return {}

    def kyberswap_build(self, chain: str, route: dict, sender: str, recipient: str, slippage: int = 50) -> dict:
        """Build swap transaction on KyberSwap."""
        chain_ids = {
            "base": "base",
            "ethereum": "ethereum",
            "arbitrum": "arbitrum",
            "polygon": "polygon",
            "bsc": "bsc",
        }
        chain_id = chain_ids.get(chain, "base")
        try:
            resp = requests.post(
                f"{self.KYBERSWAP_API}/{chain_id}/api/v1/route/build",
                json={
                    "routeSummary": route,
                    "sender": sender,
                    "recipient": recipient,
                    "slippageTolerance": slippage,
                },
                timeout=10,
            )
            return resp.json()
        except Exception as e:
            logger.error(f"KyberSwap build error: {e}")
            return {}

    # ==================== LIFI (Multi-chain) ====================

    def lifi_quote(
        self,
        from_chain: str,
        to_chain: str,
        from_token: str,
        to_token: str,
        from_amount: str,
        from_address: str,
    ) -> dict:
        """Get quote from LiFi."""
        try:
            resp = requests.get(
                f"{self.LIFI_API}/quote",
                params={
                    "fromChain": from_chain,
                    "toChain": to_chain,
                    "fromToken": from_token,
                    "toToken": to_token,
                    "fromAmount": from_amount,
                    "fromAddress": from_address,
                },
                headers={"x-lifi-api-key": self.LIFI_API_KEY},
                timeout=15,
            )
            return resp.json()
        except Exception as e:
            logger.error(f"LiFi quote error: {e}")
            return {}

    def lifi_chains(self) -> list[dict]:
        """Get supported chains from LiFi."""
        try:
            resp = requests.get(
                f"{self.LIFI_API}/chains",
                headers={"x-lifi-api-key": self.LIFI_API_KEY},
                timeout=10,
            )
            return resp.json().get("chains", [])
        except Exception as e:
            logger.error(f"LiFi chains error: {e}")
            return []

    # ==================== OPENOCEAN (Multi-chain) ====================

    def openocean_quote(
        self,
        chain: str,
        in_token: str,
        out_token: str,
        amount: str,
        gas_price: str = "5",
    ) -> dict:
        """Get quote from OpenOcean."""
        chain_ids = {
            "base": 8453,
            "ethereum": 1,
            "arbitrum": 42161,
            "polygon": 137,
            "bsc": 56,
            "solana": 101,
        }
        chain_id = chain_ids.get(chain, 8453)
        try:
            resp = requests.get(
                f"{self.OPENOCEAN_API}/{chain_id}/quote",
                params={
                    "inTokenAddress": in_token,
                    "outTokenAddress": out_token,
                    "amount": amount,
                    "gasPrice": gas_price,
                },
                timeout=10,
            )
            return resp.json()
        except Exception as e:
            logger.error(f"OpenOcean quote error: {e}")
            return {}

    # ==================== VELORA/PARASWAP (EVM) ====================

    def velora_quote(
        self,
        chain: int,
        src_token: str,
        dest_token: str,
        amount: str,
        src_decimals: int = 18,
        dest_decimals: int = 18,
    ) -> dict:
        """Get quote from Velora (ParaSwap)."""
        try:
            resp = requests.get(
                f"{self.VELORA_API}/prices",
                params={
                    "srcToken": src_token,
                    "destToken": dest_token,
                    "amount": amount,
                    "srcDecimals": src_decimals,
                    "destDecimals": dest_decimals,
                    "network": chain,
                    "version": 6.2,
                },
                timeout=10,
            )
            return resp.json()
        except Exception as e:
            logger.error(f"Velora quote error: {e}")
            return {}

    # ==================== PORTALS.FI ====================

    def portals_quote(self, chain: str, token_in: str, token_out: str, amount: str) -> dict:
        """Get quote from Portals.fi."""
        chain_ids = {
            "base": 8453,
            "ethereum": 1,
            "arbitrum": 42161,
            "polygon": 137,
            "bsc": 56,
            "solana": "solana",
        }
        chain_id = chain_ids.get(chain, 8453)

        try:
            headers = {"Authorization": f"Bearer {self.PORTALS_BEARER}"}
            resp = requests.get(
                f"{self.PORTALS_API}/quote",
                params={
                    "chainId": chain_id,
                    "tokenIn": token_in,
                    "tokenOut": token_out,
                    "amountIn": amount,
                },
                headers=headers,
                timeout=15,
            )

            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Portals.fi quote error: {e}")
        return {}

    # ==================== ENSO BUILD ====================

    def enso_quote(self, chain: str, token_in: str, token_out: str, amount: str) -> dict:
        """Get quote from Enso Build API."""
        chain_ids = {
            "base": 8453,
            "ethereum": 1,
            "arbitrum": 42161,
            "polygon": 137,
            "bsc": 56,
        }
        chain_id = chain_ids.get(chain, 8453)

        try:
            resp = requests.get(
                f"{self.ENSO_API}/route",
                params={
                    "chainId": chain_id,
                    "tokenIn": token_in,
                    "tokenOut": token_out,
                    "amountIn": amount,
                },
                timeout=15,
            )

            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Enso quote error: {e}")
        return {}

    # ==================== ODOS (EVM) ====================

    def odos_quote(self, chain: str, token_in: str, token_out: str, amount: str, wallet: str = "") -> dict:
        """Get quote from Odos."""
        chain_ids = {
            "base": 8453,
            "ethereum": 1,
            "arbitrum": 42161,
            "polygon": 137,
            "bsc": 56,
        }
        chain_id = chain_ids.get(chain, 8453)
        if not wallet:
            wallet = self.evm_account.address if self.evm_account else ""

        try:
            resp = requests.post(
                f"{self.ODOS_API}/sor/quote/v2",
                json={
                    "chainId": chain_id,
                    "inputTokens": [{"tokenAddress": token_in, "amount": amount}],
                    "outputTokens": [{"tokenAddress": token_out, "proportion": 1}],
                    "userAddr": wallet,
                    "slippageLimitPercent": 0.3,
                    "compact": True,
                },
                timeout=15,
            )

            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Odos quote error: {e}")
        return {}

    def odos_assemble(self, path_id: str, wallet: str = "") -> dict:
        """Assemble Odos transaction from path ID."""
        if not wallet:
            wallet = self.evm_account.address if self.evm_account else ""
        try:
            resp = requests.post(
                f"{self.ODOS_API}/sor/assemble",
                json={
                    "pathId": path_id,
                    "simulate": False,
                    "userAddr": wallet,
                },
                timeout=15,
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Odos assemble error: {e}")
        return {}

    # ==================== COW PROTOCOL (Base) ====================

    def cow_quote(self, token_in: str, token_out: str, amount: str) -> dict:
        """Get quote from CoW Protocol (Base). Uses sellAmountBeforeFee."""
        try:
            resp = requests.post(
                f"{self.COW_API}/api/v1/quote",
                json={
                    "sellToken": token_in,
                    "buyToken": token_out,
                    "sellAmountBeforeFee": amount,
                    "from": self.evm_account.address if self.evm_account else "",
                    "receiver": self.evm_account.address if self.evm_account else "",
                    "validTo": int(time.time()) + 1800,
                    "appData": "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "partiallyFillable": False,
                    "sellTokenBalance": "erc20",
                    "buyTokenBalance": "erc20",
                    "kind": "sell",
                    "signingScheme": "eip712",
                },
                headers={"Content-Type": "application/json"},
                timeout=15,
            )

            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"CoW quote error: {e}")
        return {}

    # ==================== RAYDIUM (Solana) ====================

    def raydium_quote(self, input_mint: str, output_mint: str, amount: int, slippage_bps: int = 50) -> dict:
        """Get quote from Raydium (Solana)."""
        try:
            resp = requests.get(
                f"{self.RAYDIUM_API}/compute/swap-base-in",
                params={
                    "inputMint": input_mint,
                    "outputMint": output_mint,
                    "amount": str(amount),
                    "slippageBps": str(slippage_bps),
                    "txVersion": "V0",
                },
                timeout=15,
            )

            if resp.status_code == 200:
                data = resp.json()
                if data.get("success"):
                    return data.get("data", {})
        except Exception as e:
            logger.error(f"Raydium quote error: {e}")
        return {}

    # ==================== JUPITER V1 API ====================

    def jupiter_v1_quote(self, input_mint: str, output_mint: str, amount: int, slippage_bps: int = 50) -> dict:
        """Get quote from Jupiter v1 API (fallback when v6 blocked)."""
        try:
            resp = requests.get(
                f"{self.JUPITER_API_V1}/quote",
                params={
                    "inputMint": input_mint,
                    "outputMint": output_mint,
                    "amount": str(amount),
                    "slippageBps": slippage_bps,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Jupiter v1 quote error: {e}")
        return {}

    # ==================== OKU TRADE ====================

    def oku_quote(self, chain: str, token_in: str, token_out: str, amount: str) -> dict:
        """Get quote from Oku Trade API."""
        chain_names = {
            "base": "base",
            "ethereum": "ethereum",
            "arbitrum": "arbitrum",
            "polygon": "polygon",
            "bsc": "bsc",
        }
        chain_name = chain_names.get(chain, "base")

        try:
            resp = requests.get(
                f"{self.OKU_API}/{chain_name}/quote",
                params={
                    "tokenIn": token_in,
                    "tokenOut": token_out,
                    "amount": amount,
                },
                timeout=15,
            )

            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Oku quote error: {e}")
        return {}

    # ==================== BALANCE CHECKS ====================

    def get_token_address(self, symbol: str, chain: str) -> str | None:
        """Get token address from symbol."""
        # Top tokens mapping
        TOP_TOKENS = {
            "base": {
                "ANDY": "0x029Eb076D2E9E5b2dDc1aB7BDe2D5d3b4b1bfAA0",
                "BRETT": "0x532f27101965dd16442E59d40670FaF5eBB142E4",
                "DEGEN": "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
                "TOSHI": "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
                "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            },
            "solana": {
                "BONK": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
                "WIF": "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
                "POPCAT": "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
                "MYRO": "HhJpBhRRn4g56VsyTuTMEjY2rLxMy8R3kXezvJcVNqFQ",
                "SILLY": "7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs",
                "SMOG": "FS66vFbZmq8r4GKoF7PqZf7mVz1kLTsZ7gZpFLhR5sMh",
            },
        }

        chain_tokens = TOP_TOKENS.get(chain, {})
        if symbol.upper() in chain_tokens:
            return chain_tokens[symbol.upper()]

        # Return the symbol itself if it looks like an address
        if chain == "base" and symbol.startswith("0x") and len(symbol) == 42 or chain == "solana" and len(symbol) > 30:
            return symbol

        return None

    def get_balance(self, chain: str) -> Decimal:
        """Get native balance."""
        if chain == "base" and self.w3 and self.evm_account:
            try:
                bal = self.w3.eth.get_balance(self.evm_account.address)
                return Decimal(bal) / Decimal(1e18)
            except Exception as e:
                logger.error(f"Balance error: {e}")
        elif chain == "solana" and self.solana_keypair:
            try:
                rpc = os.environ.get("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
                resp = requests.post(
                    rpc,
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getBalance",
                        "params": [str(self.solana_keypair.pubkey())],
                    },
                    timeout=10,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if "result" in data:
                        return Decimal(data["result"]["value"]) / Decimal(1e9)
            except Exception as e:
                logger.error(f"Solana balance error: {e}")
        return Decimal("0")

    def get_evm_balance(self) -> Decimal:
        """Compatibility wrapper for Base native balance."""
        return self.get_balance("base")

    def get_solana_balance(self) -> Decimal:
        """Compatibility wrapper for Solana native balance."""
        return self.get_balance("solana")

    def get_token_balance(self, token_address: str, chain: str = "base") -> Decimal:
        """Get ERC20 token balance on EVM chain."""
        if chain != "base" or not self.w3 or not self.evm_account:
            return Decimal("0")
        try:
            # Standard ERC20 balanceOf
            abi = [
                {
                    "inputs": [{"name": "account", "type": "address"}],
                    "name": "balanceOf",
                    "outputs": [{"name": "", "type": "uint256"}],
                    "stateMutability": "view",
                    "type": "function",
                },
                {
                    "inputs": [],
                    "name": "decimals",
                    "outputs": [{"name": "", "type": "uint8"}],
                    "stateMutability": "view",
                    "type": "function",
                },
            ]
            contract = self.w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=abi)
            raw = contract.functions.balanceOf(self.evm_account.address).call()
            try:
                decimals = contract.functions.decimals().call()
            except Exception:
                decimals = 18
            return Decimal(raw) / Decimal(10**decimals)
        except Exception as e:
            logger.error(f"Token balance error for {token_address}: {e}")
            return Decimal("0")

    def get_all_holdings(self) -> dict:
        """Get all token holdings on Base - used for capital reallocation."""
        holdings = {}
        # Known tokens to check
        tokens = {
            "BRETT": "0x532f27101965dd16442E59d40670FaF5eBB142E4",
            "DEGEN": "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
            "TOSHI": "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
            "HIGHER": "0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe",
            "NORMIE": "0x7F12d13B34F5F4f0a9449c16Bcd42f0da47AF200",
            "TYBG": "0x0d97F261b1e88845184f678e2d1e7a98D9FD38dE",
            "CHOMP": "0x88368d9e28f5dF553b6B5Ccc4DB6eF8E9dDd54B4",
            "BRETT2": "0x9a26f5433671751c3276a065f57e5a02d2817973",
        }
        for name, addr in tokens.items():
            bal = self.get_token_balance(addr, "base")
            if bal > Decimal("0.001"):
                holdings[name] = {"address": addr, "balance": bal}

        # Also check WETH
        weth_bal = self.get_token_balance("0x4200000000000000000000000000000000000006", "base")
        if weth_bal > Decimal("0.00001"):
            holdings["WETH"] = {
                "address": "0x4200000000000000000000000000000000000006",
                "balance": weth_bal,
            }

        return holdings

    def sell_token_for_eth(self, token_name: str, token_address: str, sell_pct: float = 0.3) -> bool:
        """Sell a portion of a token holding to free up ETH for gas and trading."""
        token_bal = self.get_token_balance(token_address, "base")
        if token_bal <= Decimal("0"):
            logger.warning(f"No {token_name} balance to sell")
            return False

        sell_amount = token_bal * Decimal(str(sell_pct))
        logger.info(f"SELLING {sell_amount:.4f} {token_name} ({sell_pct*100:.0f}% of {token_bal:.4f}) to free up ETH")

        # Use Odos to sell token -> WETH (then unwrap or use directly for gas)
        try:
            amount_wei = str(int(sell_amount * Decimal(10**18)))

            # Get quote from Odos
            quote_resp = requests.post(
                "https://api.odos.xyz/sor/quote/v2",
                json={
                    "chainId": 8453,
                    "inputTokens": [{"tokenAddress": token_address, "amount": amount_wei}],
                    "outputTokens": [
                        {
                            "tokenAddress": "0x4200000000000000000000000000000000000006",
                            "proportion": 1,
                        }
                    ],
                    "userAddr": self.evm_account.address,
                    "slippageLimitPercent": 5,
                },
                timeout=15,
            )

            if quote_resp.status_code != 200:
                logger.error(f"Odos sell quote failed: {quote_resp.status_code}")
                return False

            quote = quote_resp.json()

            # Assemble transaction
            assemble_resp = requests.post(
                "https://api.odos.xyz/sor/assemble",
                json={
                    "userAddr": self.evm_account.address,
                    "pathId": quote.get("pathId"),
                    "simulate": False,
                },
                timeout=15,
            )

            if assemble_resp.status_code != 200:
                logger.error(f"Odos assemble failed: {assemble_resp.status_code}")
                return False

            tx_data = assemble_resp.json().get("transaction", {})

            tx = {
                "from": self.evm_account.address,
                "to": Web3.to_checksum_address(tx_data.get("to")),
                "data": tx_data.get("data"),
                "value": int(tx_data.get("value", 0)),
                "gas": int(tx_data.get("gas", 300000)),
                "maxFeePerGas": self.w3.eth.gas_price,
                "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                "nonce": self.w3.eth.get_transaction_count(self.evm_account.address, "pending"),
                "chainId": 8453,
            }

            signed = self.evm_account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status == 1:
                logger.info(f"SELL CONFIRMED: {token_name} -> WETH | tx: {tx_hash.hex()}")
                return True
            else:
                logger.error(f"Sell failed: {tx_hash.hex()}")
                return False

        except Exception as e:
            logger.error(f"Sell {token_name} error: {e}")
            import traceback

            traceback.print_exc()
            return False

    def should_sell_position(self, token: str, position: dict) -> bool:
        """Determine if a position should be sold to chase faster movers."""
        entry_time = position.get("timestamp", 0)
        age_seconds = time.time() - entry_time

        # Sell if position is older than 2 hours and hasn't been profitable
        # (we'd have updated entry_price if it was going up)
        if age_seconds > 7200:  # 2 hours
            logger.info(f"Position {token} is {age_seconds/3600:.1f}h old - rotating out")
            return True

        # Sell if position is older than 30 min and a higher-confidence signal appeared
        # (checked in the main loop)
        return False

    # ==================== BRIDGING (CROSS-CHAIN) ====================

    def bridge_quote(self, from_chain: str, to_chain: str, token: str, amount: str) -> dict:
        """Get bridge quote using LiFi."""
        chain_ids = {
            "base": 8453,
            "ethereum": 1,
            "arbitrum": 42161,
            "polygon": 137,
            "bsc": 56,
            "solana": 1151111081099710,
        }

        from_chain_id = chain_ids.get(from_chain, 8453)
        to_chain_id = chain_ids.get(to_chain, 1)

        try:
            resp = requests.get(
                f"{self.LIFI_API}/quote",
                params={
                    "fromChain": from_chain_id,
                    "toChain": to_chain_id,
                    "fromToken": token,
                    "toToken": token,  # Same token on destination
                    "fromAmount": amount,
                    "fromAddress": self.evm_account.address if self.evm_account else "",
                },
                headers={"x-lifi-api-key": self.LIFI_API_KEY},
                timeout=15,
            )

            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Bridge quote error: {e}")
        return {}

    def execute_bridge(self, from_chain: str, to_chain: str, token: str, amount: str) -> bool:
        """Execute cross-chain bridge."""
        quote = self.bridge_quote(from_chain, to_chain, token, amount)
        if not quote:
            logger.error("Failed to get bridge quote")
            return False

        # LiFi returns transaction data in the quote
        tx_data = quote.get("transactionRequest", {})
        if not tx_data:
            logger.error("No transaction data in bridge quote")
            return False

        logger.info(f"Bridge quote: {amount} {token} from {from_chain} to {to_chain}")
        # Execute transaction (similar to swap execution)
        return True

    # ==================== LIQUIDITY POOLING ====================

    def get_pool_info(self, token_a: str, token_b: str, chain: str = "base") -> dict:
        """Get liquidity pool information."""
        # KyberSwap pool info
        try:
            resp = requests.get(
                f"{self.KYBERSWAP_API}/{chain}/api/v1/pools",
                params={
                    "tokenIn": token_a,
                    "tokenOut": token_b,
                },
                timeout=15,
            )

            if resp.status_code == 200:
                data = resp.json()
                if "data" in data and data["data"]:
                    pool = data["data"][0]
                    return {
                        "address": pool.get("poolAddress"),
                        "liquidity": pool.get("liquidityUsd", 0),
                        "apr": pool.get("apr", 0),
                        "fee": pool.get("fee", 0),
                    }
        except Exception as e:
            logger.error(f"Pool info error: {e}")

        return {}

    # ==================== LIMIT ORDERS ====================

    def create_limit_order(
        self,
        token_in: str,
        token_out: str,
        amount: str,
        target_price: str,
        chain: str = "base",
    ) -> dict:
        """Create a limit order."""
        logger.info(f"Creating limit order: {amount} {token_in} -> {token_out} at price {target_price}")

        # Oku supports limit orders
        try:
            resp = requests.post(
                f"{self.OKU_API}/{chain}/limit-order",
                json={
                    "tokenIn": token_in,
                    "tokenOut": token_out,
                    "amountIn": amount,
                    "targetPrice": target_price,
                    "sender": self.evm_account.address if self.evm_account else "",
                },
                timeout=15,
            )

            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"Limit order error: {e}")

        return {}

    # ==================== DCA (DOLLAR COST AVERAGING) ====================

    def create_dca_order(self, token: str, amount_per_interval: str, intervals: int, chain: str = "base") -> dict:
        """Create a DCA (Dollar Cost Averaging) order."""
        logger.info(f"Creating DCA order: {amount_per_interval} {token} x {intervals} intervals")

        # Enso supports DCA strategies
        try:
            resp = requests.post(
                f"{self.ENSO_API}/dca",
                json={
                    "token": token,
                    "amountPerInterval": amount_per_interval,
                    "intervals": intervals,
                    "wallet": self.evm_account.address if self.evm_account else "",
                },
                timeout=15,
            )

            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.error(f"DCA order error: {e}")

        return {}

    # ==================== MAIN LOOP ====================

    def compare_quotes(self, chain: str, token_in: str, token_out: str, amount: str) -> dict:
        """Compare quotes across all aggregators. On-chain first, APIs as fallback."""
        quotes = {}
        WETH = "0x4200000000000000000000000000000000000006"

        if chain == "solana":
            # Jupiter v6
            jup_quote = self.jupiter_quote(token_in, token_out, int(amount))
            if jup_quote:
                quotes["jupiter"] = {
                    "output": jup_quote.get("outAmount", "0"),
                    "price_impact": jup_quote.get("priceImpactPct", 0),
                }
            else:
                # Fallback to v1 API
                jup_v1 = self.jupiter_v1_quote(token_in, token_out, int(amount))
                if jup_v1:
                    quotes["jupiter_v1"] = {
                        "output": jup_v1.get("outAmount", "0"),
                        "price_impact": jup_v1.get("priceImpactPct", 0),
                    }

            # Raydium
            ray_quote = self.raydium_quote(token_in, token_out, int(amount))
            if ray_quote:
                quotes["raydium"] = {
                    "output": ray_quote.get("outputAmount", "0"),
                    "price_impact": ray_quote.get("priceImpact", 0),
                }

            # OpenOcean (supports Solana)
            oo_quote = self.openocean_quote(chain, token_in, token_out, amount)
            if oo_quote and "data" in oo_quote:
                quotes["openocean"] = {
                    "output": oo_quote["data"].get("outAmount", "0"),
                    "gas": oo_quote["data"].get("estimatedGas", "0"),
                }
        else:
            # === ON-CHAIN QUOTES (free, no API needed) ===

            # Uniswap V3 QuoterV2 (on-chain view function)
            if self.contract_executor:
                t_in = token_in if token_in != "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" else WETH
                t_out = token_out if token_out != "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" else WETH
                best_uni = 0
                best_fee = 3000
                for fee in [500, 3000, 10000]:
                    out = self.contract_executor.quote_univ3(t_in, t_out, int(amount), fee)
                    if out > best_uni:
                        best_uni = out
                        best_fee = fee
                if best_uni > 0:
                    quotes["uniswap_v3_onchain"] = {
                        "output": str(best_uni),
                        "fee": best_fee,
                        "source": "QuoterV2 (view function)",
                    }

            # === API QUOTES (fallback) ===

            # KyberSwap (also collect build calldata for contract execution)
            ks_quote = self.kyberswap_quote(chain, token_in, token_out, amount)
            if ks_quote and "data" in ks_quote:
                route_summary = ks_quote["data"].get("routeSummary", {})
                amount_out = route_summary.get("amountOut", "0")
                quotes["kyberswap"] = {
                    "output": amount_out,
                    "gas_usd": route_summary.get("gasUsd", "0"),
                }
                # Build calldata for contract execution
                try:
                    import time as _time

                    build_resp = requests.post(
                        f"{self.KYBERSWAP_API}/{chain}/api/v1/route/build",
                        json={
                            "routeSummary": route_summary,
                            "sender": self.evm_account.address,
                            "recipient": self.evm_account.address,
                            "slippageTolerance": 100,
                            "deadline": int(_time.time()) + 1800,
                            "source": "hermes-bot",
                        },
                        timeout=15,
                    )
                    if build_resp.status_code == 200:
                        bd = build_resp.json()
                        if bd.get("code", -1) == 0 and "data" in bd:
                            tx = bd["data"]
                            quotes["kyberswap"]["_tx"] = {
                                "to": tx.get("routerAddress"),
                                "data": tx.get("data"),
                                "gas": tx.get("gas", 300000),
                                "value": tx.get("transactionValue", "0"),
                            }
                except Exception as e:
                    logger.debug(f"KyberSwap build failed: {e}")

            # OpenOcean
            oo_quote = self.openocean_quote(chain, token_in, token_out, amount)
            if oo_quote and "data" in oo_quote:
                quotes["openocean"] = {
                    "output": oo_quote["data"].get("outAmount", "0"),
                    "gas": oo_quote["data"].get("estimatedGas", "0"),
                }

            # Velora
            vel_quote = self.velora_quote(8453 if chain == "base" else 1, token_in, token_out, amount)
            if vel_quote and "priceRoute" in vel_quote:
                quotes["velora"] = {
                    "output": vel_quote["priceRoute"].get("destAmount", "0"),
                    "gas": vel_quote["priceRoute"].get("gasCost", "0"),
                }

            # Odos (also collect assembled tx for contract execution)
            odos_quote = self.odos_quote(chain, token_in, token_out, amount)
            if odos_quote:
                out_amounts = odos_quote.get("outAmounts", ["0"])
                path_id = odos_quote.get("pathId", "")
                quotes["odos"] = {
                    "output": out_amounts[0] if out_amounts else "0",
                    "path_id": path_id,
                    "price_impact": odos_quote.get("priceImpact", 0),
                }
                # Assemble tx for contract execution
                if path_id:
                    try:
                        asm = self.odos_assemble(path_id)
                        if asm and "transaction" in asm:
                            tx = asm["transaction"]
                            quotes["odos"]["_tx"] = {
                                "to": tx.get("to"),
                                "data": tx.get("data"),
                                "gas": tx.get("gas", 300000),
                                "value": tx.get("value", "0"),
                            }
                    except Exception as e:
                        logger.debug(f"Odos assemble failed: {e}")

            # CoW Protocol (Base only, WETH pairs)
            if chain == "base":
                cow_in = token_in if token_in != "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" else WETH
                cow_quote = self.cow_quote(cow_in, token_out, amount)
                if cow_quote and "quote" in cow_quote:
                    quotes["cow"] = {
                        "output": cow_quote["quote"].get("buyAmount", "0"),
                        "fee_amount": cow_quote["quote"].get("feeAmount", "0"),
                    }

            # LiFi (multi-chain)
            lifi_quote = self.lifi_quote(
                chain,
                chain,
                token_in,
                token_out,
                amount,
                self.evm_account.address if self.evm_account else "",
            )
            if lifi_quote and "estimate" in lifi_quote:
                estimate = lifi_quote["estimate"]
                if isinstance(estimate, dict):
                    quotes["lifi"] = {
                        "output": estimate.get("toAmount", "0"),
                        "gas_cost_usd": (
                            estimate.get("gasCosts", [{}])[0].get("amountUSD", "0") if estimate.get("gasCosts") else "0"
                        ),
                    }

            # Enso (rate-limited, skip if recently called)
            if not self._enso_rate_limited:
                enso_quote = self.enso_quote(chain, token_in, token_out, amount)
                if enso_quote:
                    quotes["enso"] = {
                        "output": enso_quote.get("amountOut", "0"),
                        "gas": enso_quote.get("gas", "0"),
                    }
                else:
                    self._enso_rate_limited = True

        return quotes

    def execute_base_trade(self, token_symbol: str, token_addr: str, eth_amount: float) -> bool:
        """Execute a trade on Base. Tries direct contract first, falls back to KyberSwap API."""
        amount_wei = int(eth_amount * 1e18)

        # Collect API routes for aggregator protocols
        api_routes = {}
        try:
            WETH = "0x4200000000000000000000000000000000000006"
            t_in = WETH  # Use WETH for API quotes (native ETH handled by value field)
            quotes = self.compare_quotes("base", t_in, token_addr, str(amount_wei))
            for proto in ["kyberswap", "odos"]:
                if proto in quotes and "_tx" in quotes[proto]:
                    api_routes[proto] = quotes[proto]["_tx"]
                    logger.info(f"  Collected {proto} route: {quotes[proto].get('output', '?')} out")
        except Exception as e:
            logger.debug(f"Route collection failed: {e}")

        # === PRIMARY: Direct contract execution ===
        if self.contract_executor:
            try:
                logger.info(f"[Contract] Attempting direct on-chain swap: {eth_amount:.6f} ETH -> {token_symbol}")
                tx_hash = self.contract_executor.smart_swap(
                    token_in=NATIVE_ETH,
                    token_out=token_addr,
                    amount_in=amount_wei,
                    slippage_bps=100,
                    api_routes=api_routes,
                )
                if tx_hash:
                    logger.info(f"[Contract] Trade confirmed: {tx_hash}")
                    return True
                else:
                    logger.warning("[Contract] Direct swap failed, falling back to API...")
            except Exception as e:
                logger.warning(f"[Contract] Error: {e}, falling back to API...")

        # === FALLBACK: KyberSwap API ===
        return self._execute_base_trade_api(token_symbol, token_addr, eth_amount)

    def _execute_base_trade_api(self, token_symbol: str, token_addr: str, eth_amount: float) -> bool:
        """Execute a trade on Base using KyberSwap API (fallback)."""
        try:
            import time

            # Use native ETH address for KyberSwap
            ETH_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
            amount_wei = str(int(eth_amount * 1e18))

            # Get quote with native ETH
            quote = self.kyberswap_quote("base", ETH_NATIVE, token_addr, amount_wei)
            if not quote or "data" not in quote:
                logger.error(f"Failed to get quote for {token_symbol}")
                return False

            route = quote["data"].get("routeSummary", {})
            amount_out = int(route.get("amountOut", 0))

            if amount_out == 0:
                logger.error(f"Zero output amount for {token_symbol}")
                return False

            logger.info(f"Quote: {eth_amount:.6f} ETH -> {amount_out} {token_symbol}")

            # Build transaction with proper deadline
            deadline = int(time.time()) + 1800  # 30 minutes from now

            build_body = {
                "routeSummary": route,
                "sender": self.evm_account.address,
                "recipient": self.evm_account.address,
                "slippageTolerance": 100,  # 1%
                "deadline": deadline,
                "source": "hermes-bot",
            }

            build_resp = requests.post(
                "https://aggregator-api.kyberswap.com/base/api/v1/route/build",
                json=build_body,
                timeout=15,
            )

            if build_resp.status_code != 200:
                logger.error(f"Build failed: {build_resp.text[:200]}")
                return False

            build_data = build_resp.json()

            # Validate response
            if build_data.get("code", 0) != 0:
                logger.error(f"Build error: {build_data.get('message', 'Unknown')}")
                return False

            if "data" not in build_data:
                logger.error("No data in build response")
                return False

            tx_data = build_data["data"]

            # Extract fields
            router_address = tx_data.get("routerAddress")
            transaction_value = tx_data.get("transactionValue", "0")
            calldata = tx_data.get("data")

            # Validate
            if not router_address or len(router_address) != 42:
                logger.error(f"Invalid router address: {router_address}")
                return False

            if not calldata or not calldata.startswith("0x"):
                logger.error("Invalid calldata")
                return False

            logger.info(f"Router: {router_address}, Value: {transaction_value} wei")

            # Send transaction
            if self.w3:
                tx = {
                    "from": self.evm_account.address,
                    "to": router_address,
                    "data": calldata,
                    "value": (
                        int(transaction_value, 16)
                        if isinstance(transaction_value, str) and transaction_value.startswith("0x")
                        else int(transaction_value)
                    ),
                    "gas": int(tx_data.get("gas", 300000)),
                    "maxFeePerGas": self.w3.eth.gas_price,
                    "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                    "nonce": self.w3.eth.get_transaction_count(self.evm_account.address, "pending"),
                    "chainId": 8453,
                }

                signed = self.evm_account.sign_transaction(tx)
                tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)

                logger.info(f"Trade sent: {tx_hash.hex()}")

                # Wait for receipt
                receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                if receipt.status == 1:
                    logger.info(f"Trade confirmed: {tx_hash.hex()}")
                    return True
                else:
                    logger.error(f"Trade failed: {tx_hash.hex()}")
                    return False

        except Exception as e:
            logger.error(f"Trade execution error: {e}")
            import traceback

            traceback.print_exc()

        return False

    def execute_solana_trade(self, token_symbol: str, token_mint: str, sol_amount: float) -> bool:
        """Execute a trade on Solana. Tries program adapter first, falls back to Jupiter CLI."""

        # === PRIMARY: Direct program execution via Solana adapter ===
        if self.solana_adapter:
            try:
                logger.info(f"[Solana] Direct program swap: {sol_amount} SOL -> {token_symbol}")
                SOL_MINT = "So11111111111111111111111111111111111111112"
                amount_base = int(sol_amount * 1e9)

                sig = self.solana_adapter.swap(
                    input_mint=SOL_MINT,
                    output_mint=token_mint,
                    amount=amount_base,
                    slippage_bps=100,  # 1% slippage
                )
                if sig:
                    logger.info(f"[Solana] Trade confirmed: {sig}")
                    return True
                else:
                    logger.warning("[Solana] Direct swap failed, falling back to CLI...")
            except Exception as e:
                logger.warning(f"[Solana] Adapter error: {e}, falling back to CLI...")

        # === FALLBACK: Jupiter CLI ===
        return self._execute_solana_trade_cli(token_symbol, token_mint, sol_amount)

    def _execute_solana_trade_cli(self, token_symbol: str, token_mint: str, sol_amount: float) -> bool:
        """Execute a trade on Solana using Jupiter CLI (fallback)."""
        try:
            import subprocess

            amount_str = str(sol_amount)

            # Use Jupiter CLI for swap
            cmd = [
                "/home/terexitarius/.hermes/node/bin/jup",
                "spot",
                "swap",
                "--from",
                "SOL",
                "--to",
                token_mint,
                "--amount",
                amount_str,
                "--slippage",
                "1",
            ]

            logger.info(f"Executing Jupiter swap: {amount_str} SOL -> {token_symbol}")

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
                env={
                    **os.environ,
                    "PATH": os.environ.get("PATH", "") + ":/home/terexitarius/.hermes/node/bin",
                },
            )

            if result.returncode == 0:
                logger.info(f"Jupiter swap successful: {result.stdout[:200]}")
                return True
            else:
                logger.error(f"Jupiter swap failed: {result.stderr[:200]}")

        except Exception as e:
            logger.error(f"Solana trade error: {e}")

        return False

    def execute_odos_trade(self, token_symbol: str, token_addr: str, eth_amount: float) -> bool:
        """Execute a trade on Base using Odos."""
        try:
            ETH_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"
            amount_wei = str(int(eth_amount * 1e18))

            # Get quote
            quote = self.odos_quote("base", ETH_NATIVE, token_addr, amount_wei)
            if not quote:
                logger.error(f"Odos quote failed for {token_symbol}")
                return False

            path_id = quote.get("pathId")
            out_amounts = quote.get("outAmounts", ["0"])
            if not path_id or not out_amounts:
                logger.error("Odos: no path ID or output")
                return False

            logger.info(f"Odos quote: {eth_amount:.6f} ETH -> {out_amounts[0]} {token_symbol}")

            # Assemble transaction
            assembled = self.odos_assemble(path_id)
            if not assembled or "transaction" not in assembled:
                logger.error("Odos: failed to assemble transaction")
                return False

            tx = assembled["transaction"]

            if self.w3:
                # Build and send transaction
                tx_data = {
                    "from": self.evm_account.address,
                    "to": tx.get("to"),
                    "data": tx.get("data"),
                    "value": (
                        int(tx.get("value", "0"), 16)
                        if isinstance(tx.get("value"), str) and tx.get("value", "").startswith("0x")
                        else int(tx.get("value", "0"))
                    ),
                    "gas": int(tx.get("gas", 300000)),
                    "maxFeePerGas": self.w3.eth.gas_price,
                    "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                    "nonce": self.w3.eth.get_transaction_count(self.evm_account.address, "pending"),
                    "chainId": 8453,
                }

                signed = self.evm_account.sign_transaction(tx_data)
                tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)

                logger.info(f"Odos trade sent: {tx_hash.hex()}")

                receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
                if receipt.status == 1:
                    logger.info(f"Odos trade confirmed: {tx_hash.hex()}")
                    return True
                else:
                    logger.error(f"Odos trade failed: {tx_hash.hex()}")
                    return False

        except Exception as e:
            logger.error(f"Odos trade error: {e}")
            import traceback

            traceback.print_exc()

        return False

    def run(self):
        """Main trading loop - executes actual trades with all capabilities."""
        logger.info("Starting DEX Aggregator Trader...")

        # Track positions and strategies
        active_positions = {}
        limit_orders = {}
        dca_schedules = {}

        while True:
            try:
                base_bal = self.get_balance("base")
                sol_bal = self.get_balance("solana")
                logger.info(f"Balances - Base: {base_bal:.6f} ETH, Solana: {sol_bal:.6f} SOL")

                # ==================== CHECK ALL HOLDINGS ====================
                holdings = self.get_all_holdings()
                if holdings:
                    holding_str = ", ".join(f"{k}: {v['balance']:.2f}" for k, v in holdings.items())
                    logger.info(f"Token holdings: {holding_str}")

                # ==================== FREE UP ETH FROM TOKEN HOLDINGS ====================
                # If ETH is too low to trade but we have token holdings, sell some to get ETH
                if base_bal < Decimal("0.0003") and holdings:
                    # Find the best token to sell (prefer ones not in active positions)
                    for tok_name, tok_info in holdings.items():
                        if tok_name == "WETH":
                            continue  # Don't sell WETH to get ETH
                        if tok_name in active_positions:
                            continue  # Don't sell active positions
                        logger.info(f"ETH low ({base_bal:.6f}), selling some {tok_name} to free up capital")
                        sold = self.sell_token_for_eth(tok_name, tok_info["address"], sell_pct=0.3)
                        if sold:
                            time.sleep(3)  # Wait for state to update
                            base_bal = self.get_balance("base")
                            logger.info(f"ETH after sell: {base_bal:.6f}")
                            break  # One sell per cycle

                # ==================== ROTATE OLD POSITIONS ====================
                for token, position in list(active_positions.items()):
                    if self.should_sell_position(token, position):
                        chain = position.get("chain", "base")
                        if chain == "base":
                            token_addr = self.get_token_address(token, "base")
                            if token_addr and base_bal > Decimal("0.0001"):
                                logger.info(f"Rotating: selling {token} to chase faster movers")
                                sold = self.sell_token_for_eth(token, token_addr, sell_pct=1.0)
                                if sold:
                                    del active_positions[token]
                                    time.sleep(3)
                                    base_bal = self.get_balance("base")

                # ==================== SIGNAL-BASED TRADING ====================
                try:
                    try:
                        from signal_providers import aggregate_signals
                    except ImportError:
                        from agent_signal_provider import aggregate_signals

                    signals = aggregate_signals()
                    logger.info(f"Signals: {len(signals)}")

                    for signal in signals:
                        token = signal.get("token", "?")
                        action = signal.get("action", "?")
                        conf = signal.get("confidence", 0)
                        chain = signal.get("chain", "base")

                        # Only trade on high-confidence BUY signals
                        if action == "BUY" and conf >= 0.7:
                            # Use token_address from signal if available (Dexscreener, SmartMoney)
                            token_addr = signal.get("token_address") or self.get_token_address(token, chain)

                            traded = False

                            if chain == "base" and base_bal > Decimal("0.0001"):
                                # Trade 50% of ETH balance
                                trade_amount = float(base_bal) * 0.5

                                # Check if trade is > 5 cents
                                if trade_amount > 0.00002:  # ~$0.05
                                    logger.info(f"Trading {trade_amount:.6f} ETH for {token} on Base")
                                    success = self.execute_base_trade(token, token_addr, trade_amount)
                                    if success:
                                        logger.info(f"Successfully bought {token}")
                                        active_positions[token] = {
                                            "chain": chain,
                                            "amount": trade_amount,
                                            "entry_price": 0,
                                            "timestamp": time.time(),
                                        }
                                        traded = True
                                    else:
                                        logger.error(f"Failed to buy {token}")
                                else:
                                    logger.warning(f"Trade too small: {trade_amount:.6f} ETH")

                            elif chain == "solana" and sol_bal > Decimal("0.05"):
                                # Trade 50% of SOL balance
                                trade_amount = float(sol_bal) * 0.5

                                # Check if trade is > 5 cents
                                if trade_amount > 0.0006:  # ~$0.05
                                    logger.info(f"Trading {trade_amount:.6f} SOL for {token} on Solana")
                                    sol_mint = token_addr or token
                                    success = self.execute_solana_trade(token, sol_mint, trade_amount)
                                    if success:
                                        logger.info(f"Successfully bought {token}")
                                        active_positions[token] = {
                                            "chain": chain,
                                            "amount": trade_amount,
                                            "entry_price": 0,
                                            "timestamp": time.time(),
                                        }
                                        traded = True
                                    else:
                                        logger.error(f"Failed to buy {token}")
                                else:
                                    logger.warning(f"Trade too small: {trade_amount:.6f} SOL")

                            if not traded:
                                if chain == "base" and base_bal <= Decimal("0.0001"):
                                    logger.warning(
                                        f"Insufficient Base balance ({base_bal:.6f} ETH) for {token} - need >0.0001 ETH"
                                    )
                                elif chain == "solana" and sol_bal <= Decimal("0.05"):
                                    logger.warning(
                                        f"Insufficient Solana balance ({sol_bal:.6f} SOL) for {token} - need >0.05 SOL"
                                    )

                        elif action == "BUY" and conf < 0.7:
                            logger.debug(f"Skipping {token}: confidence {conf:.2f} < 0.70 threshold")

                except Exception as e:
                    logger.error(f"Signal error: {e}")
                    import traceback

                    traceback.print_exc()

                # Log funding status if no trades were possible
                if base_bal < Decimal("0.0001") and sol_bal < Decimal("0.05"):
                    logger.warning(
                        f"LOW FUNDS - cannot trade on either chain. Base: {base_bal:.6f} ETH, Solana: {sol_bal:.6f} SOL"
                    )
                elif base_bal < Decimal("0.0001") and not holdings:
                    logger.info(f"Base balance low ({base_bal:.6f} ETH) and no token holdings to sell")

                # ==================== BRIDGING OPPORTUNITIES ====================
                # Check if we should bridge between chains
                if base_bal > Decimal("0.001") and sol_bal < Decimal("0.01"):
                    # More ETH than SOL - consider bridging
                    logger.info("Checking bridging opportunities: Base -> Solana")
                    bridge_amount = str(int(float(base_bal) * 0.3 * 1e18))  # 30% of ETH
                    bridge_quote = self.bridge_quote(
                        "base",
                        "solana",
                        "0x4200000000000000000000000000000000000006",
                        bridge_amount,
                    )
                    if bridge_quote:
                        logger.info(
                            f"Bridge quote available: {bridge_quote.get('estimate', {}).get('toAmount', 'N/A')}"
                        )

                elif sol_bal > Decimal("0.05") and base_bal < Decimal("0.0005"):
                    # More SOL than ETH - consider bridging
                    logger.info("Checking bridging opportunities: Solana -> Base")
                    bridge_amount = str(int(float(sol_bal) * 0.3 * 1e9))  # 30% of SOL
                    bridge_quote = self.bridge_quote(
                        "solana",
                        "base",
                        "So11111111111111111111111111111111111111112",
                        bridge_amount,
                    )
                    if bridge_quote:
                        logger.info(
                            f"Bridge quote available: {bridge_quote.get('estimate', {}).get('toAmount', 'N/A')}"
                        )

                # ==================== LIQUIDITY POOLING ====================
                # Check for liquidity pooling opportunities when we have idle capital
                if base_bal > Decimal("0.002") and not active_positions:
                    # More than 0.002 ETH and no active positions - consider liquidity
                    logger.info("Checking liquidity pooling opportunities")

                    # Check WETH/USDC pool
                    pool_info = self.get_pool_info(
                        "0x4200000000000000000000000000000000000006",  # WETH
                        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  # USDC
                        "base",
                    )
                    if pool_info:
                        apr = pool_info.get("apr", 0)
                        liquidity = pool_info.get("liquidity", 0)
                        logger.info(f"WETH/USDC Pool: APR={apr}%, Liquidity=${liquidity:,.0f}")

                        if apr > 10 and liquidity > 100000:  # 10% APR and $100k+ liquidity
                            logger.info("Good liquidity opportunity found!")

                # ==================== LIMIT ORDERS ====================
                # Check if we should place limit orders for existing positions
                for token, position in list(active_positions.items()):
                    if position.get("chain") == "base":
                        # Place limit order to sell at 20% profit
                        entry_price = position.get("entry_price", 0)
                        if entry_price > 0:
                            target_price = str(entry_price * 1.2)  # 20% profit
                            token_addr = self.get_token_address(token, "base")
                            if token_addr:
                                logger.info(f"Checking limit order for {token} at {target_price}")
                                order = self.create_limit_order(
                                    token_addr,
                                    "0x4200000000000000000000000000000000000006",  # WETH
                                    str(int(position["amount"] * 1e18)),
                                    target_price,
                                    "base",
                                )
                                if order:
                                    limit_orders[token] = order
                                    logger.info(f"Limit order placed for {token}")

                # ==================== DCA STRATEGIES ====================
                # Check for DCA opportunities (regular purchases of established tokens)
                dca_tokens = ["BRETT", "DEGEN", "TOSHI"]  # Base tokens to DCA
                if base_bal > Decimal("0.001") and not dca_schedules:
                    # Start DCA if we have funds and no active DCA
                    for token in dca_tokens:
                        token_addr = self.get_token_address(token, "base")
                        if token_addr:
                            dca_amount = str(int(float(base_bal) * 0.1 * 1e18))  # 10% of balance
                            logger.info(f"Checking DCA for {token}")
                            dca_order = self.create_dca_order(token_addr, dca_amount, 7, "base")
                            if dca_order:
                                dca_schedules[token] = dca_order
                                logger.info(f"DCA started for {token}: {dca_amount} wei x 7 days")
                                break  # Only start one DCA at a time

                time.sleep(300)  # 5 minutes

            except KeyboardInterrupt:
                logger.info("Stopping trader...")
                break
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(60)


def main():
    import signal

    # Set up single-instance lock and signal handlers
    acquire_lock()
    atexit.register(release_lock)

    def _signal_handler(sig, frame):
        release_lock()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _signal_handler)
    signal.signal(signal.SIGINT, _signal_handler)

    try:
        trader = DexAggregatorTrader()

        logger.info("=" * 60)
        logger.info("DEX Aggregator Trader")
        logger.info("=" * 60)

        if trader.evm_account:
            logger.info(f"EVM: {trader.evm_account.address}")
        if trader.solana_keypair:
            logger.info(f"Solana: {trader.solana_keypair.pubkey()}")

        logger.info("Capabilities: Swaps, Bridging, Liquidity Pooling, Limit Orders, DCA")
        logger.info("=" * 60)

        trader.run()

    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()
