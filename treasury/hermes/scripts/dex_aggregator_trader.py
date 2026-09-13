#!/usr/bin/env python3
"""
DEX Aggregator Trading Bot
Uses multiple DEX aggregators for optimal trading across Base and Solana.
"""

import json
import logging
import os
import sys
import time
from decimal import Decimal

import requests
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config
from dotenv import load_dotenv
from eth_account import Account
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
            # Check if process is alive
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

    # Write our PID
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


import atexit

atexit.register(release_lock)


# Clean up on signals too
def _signal_handler(sig, frame):
    release_lock()
    sys.exit(0)


import signal

signal.signal(signal.SIGTERM, _signal_handler)
signal.signal(signal.SIGINT, _signal_handler)

acquire_lock()

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Import contract executor (direct on-chain calls)
try:
    from contract_executor import ContractExecutor
    from protocol_registry import NATIVE_ETH

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
    METEORA_API = "https://dlmm-api.meteora.ag"
    ORCA_API = "https://api.orca.so"
    PUMPSWAP_API = "https://frontend-api.pump.fun"
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

                    # Set Helius RPC for Solana
                    self.solana_rpc = os.environ.get(
                        "SOLANA_RPC_URL",
                        f"https://mainnet.helius-rpc.com/?api-key={os.environ.get('HELIUS_API_KEY', 'bb6ff3e9-e38d-4362-9e7a-669a00d497a8')}",
                    )

                    # Initialize Solana program adapter
                    if HAS_SOLANA_ADAPTER:
                        try:
                            self.solana_adapter = SolanaProgramAdapter(rpc_url=self.solana_rpc, private_key=solana_pk)
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
            f"https://base-mainnet.g.alchemy.com/v2/{os.environ.get('ALCHEMY_API_KEY', 'DbRpGYbLsNo-hOI40cfh8')}",
            "https://base.llamarpc.com",
            "https://base.drpc.org",
            "https://mainnet.base.org",
            f"https://bold-proportionate-dinghy.base-mainnet.quiknode.pro/{os.environ.get('QUICKNODE_KEY', 'QN_9a2d68943d664e7bb3a3966791bfb4b3')}",
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
        """Get token address from symbol. Uses screener's top100.json for Base tokens."""
        # Utility/static tokens (always needed, not from screener)
        STATIC_TOKENS = {
            "base": {
                "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                "WETH": "0x4200000000000000000000000000000000000006",
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

        # Check static first (fast, no IO)
        chain_static = STATIC_TOKENS.get(chain, {})
        if symbol.upper() in chain_static:
            return chain_static[symbol.upper()]

        # For Base: load from screener
        if chain == "base":
            screener_tokens = self._load_screener_tokens()
            if symbol.upper() in screener_tokens:
                return screener_tokens[symbol.upper()]

        # Return the symbol itself if it looks like an address
        if chain == "base" and symbol.startswith("0x") and len(symbol) == 42 or chain == "solana" and len(symbol) > 30:
            return symbol

        return None

    def get_balance(self, chain: str) -> Decimal:
        """Get native balance with RPC rotation."""
        if chain == "base" and self.evm_account:
            rpcs = [
                "https://mainnet.base.org",
                "https://base.llamarpc.com",
                "https://base.drpc.org",
                "https://1rpc.io/base",
                "https://base.meowrpc.com",
                f"https://base-mainnet.g.alchemy.com/v2/{os.environ.get('ALCHEMY_API_KEY', 'DbRpGYbLsNo-hOI40cfh8')}",
                f"https://bold-proportionate-dinghy.base-mainnet.quiknode.pro/{os.environ.get('QUICKNODE_KEY', 'QN_9a2d68943d664e7bb3a3966791bfb4b3')}",
                "https://rpc.ankr.com/base/0e8c5d238f6a82f29d32988cccc7094b7435463936045a913be32563e16b5792",
            ]
            for rpc_url in rpcs:
                try:
                    w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 10}))
                    bal = w3.eth.get_balance(self.evm_account.address)
                    return Decimal(bal) / Decimal(1e18)
                except Exception:
                    continue
            logger.error("All Base RPCs failed for balance check")
        elif chain == "solana" and self.solana_keypair:
            try:
                rpc = getattr(
                    self,
                    "solana_rpc",
                    os.environ.get(
                        "SOLANA_RPC_URL",
                        f"https://mainnet.helius-rpc.com/?api-key={os.environ.get('HELIUS_API_KEY', 'bb6ff3e9-e38d-4362-9e7a-669a00d497a8')}",
                    ),
                )
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

    def get_token_balance(self, token_address: str, chain: str = "base") -> Decimal:
        """Get ERC20 token balance on EVM chain with RPC rotation."""
        if chain != "base" or not self.evm_account:
            return Decimal("0")

        rpcs = [
            "https://mainnet.base.org",
            "https://base.llamarpc.com",
            "https://base.drpc.org",
            "https://1rpc.io/base",
            "https://base.meowrpc.com",
            f"https://base-mainnet.g.alchemy.com/v2/{os.environ.get('ALCHEMY_API_KEY', 'DbRpGYbLsNo-hOI40cfh8')}",
            f"https://bold-proportionate-dinghy.base-mainnet.quiknode.pro/{os.environ.get('QUICKNODE_KEY', 'QN_9a2d68943d664e7bb3a3966791bfb4b3')}",
            "https://rpc.ankr.com/base/0e8c5d238f6a82f29d32988cccc7094b7435463936045a913be32563e16b5792",
        ]

        # Standard ERC20 balanceOf + decimals ABI
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

        for rpc_url in rpcs:
            try:
                w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 10}))
                if not w3.is_connected():
                    continue
                contract = w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=abi)
                raw = contract.functions.balanceOf(self.evm_account.address).call()
                try:
                    decimals = contract.functions.decimals().call()
                except Exception:
                    decimals = 18
                return Decimal(raw) / Decimal(10**decimals)
            except Exception:
                continue

        logger.error(f"All RPCs failed for token balance: {token_address}")
        return Decimal("0")

    def _load_screener_tokens(self) -> dict[str, str]:
        """Load top-scoring Base tokens from the screener's top100.json."""
        screener_path = os.path.expanduser("~/.hermes/data/token_screener/top100.json")
        tokens = {}
        try:
            with open(screener_path) as f:
                data = json.load(f)
            for t in data.get("tokens", []):
                if t.get("chain") != "base":
                    continue
                addr = t.get("contract_address", "")
                sym = t.get("symbol") or t.get("dex", {}).get("symbol", "UNKNOWN")
                score = t.get("score", 0)
                if addr and score >= 20:  # Only tokens with decent screener score
                    tokens[sym] = addr
            logger.info(f"Loaded {len(tokens)} Base tokens from screener (top100.json)")
        except Exception as e:
            logger.warning(f"Failed to load screener tokens: {e}")
        return tokens

    def _discover_wallet_tokens(self) -> dict[str, str]:
        """Discover Base tokens the wallet actually holds by checking known token list + on-chain."""
        tokens = {}
        # Expanded list of popular Base tokens to check (updated regularly from Dexscreener)
        # This is NOT for trading decisions - just for discovering what we already hold
        KNOWN_BASE_TOKENS = {
            "BRETT": "0x532f27101965dd16442E59d40670FaF5eBB142E4",
            "DEGEN": "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
            "TOSHI": "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4",
            "HIGHER": "0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe",
            "NORMIE": "0x7F12d13B34F5F4f0a9449c16Bcd42f0da47AF200",
            "TYBG": "0x0d97F261b1e88845184f678e2d1e7a98D9FD38dE",
            "ANDY": "0x029Eb076D2E9E5b2dDc1aB7BDe2D5d3b4b1bfAA0",
            "BRIAN": "0x22af33fe49fd1fa80c7149773dde5890d3c76f3b",
            "BALD": "0x27D2DECb4bFC9C76F0309b8E88dec3a601Fe25a8",
            "ROCKY": "0x2Da56AcB9Ea78330f947bD57C54119Debda7AF71",
            "BOGE": "0x4F36ce48c4938e3e45cEB63e1A516c9e9D6f3d1e",
            "CHOMP": "0x6AE52E06c40068C7F804A9f4BB2B8C2e5B629199",
        }
        for sym, addr in KNOWN_BASE_TOKENS.items():
            bal = self.get_token_balance(addr, "base")
            if bal > Decimal("0.001"):
                tokens[sym] = addr
        if tokens:
            logger.info(f"Discovered {len(tokens)} held Base tokens: {', '.join(tokens.keys())}")
        return tokens

    def get_all_holdings(self) -> dict:
        """Get all token holdings on Base - checks screener tokens + wallet discovery + WETH."""
        holdings = {}

        # 1. Tokens from screener pipeline (highest priority - scored)
        screener_tokens = self._load_screener_tokens()

        # 2. Tokens the wallet actually holds (discovery scan)
        wallet_tokens = self._discover_wallet_tokens()

        # Merge: screener takes priority for naming, wallet fills gaps
        all_tokens = {**wallet_tokens, **screener_tokens}

        for name, addr in all_tokens.items():
            bal = self.get_token_balance(addr, "base")
            if bal > Decimal("0.001"):
                holdings[name] = {"address": addr, "balance": bal}

        # Always check WETH (needed for unwrapping)
        weth_bal = self.get_token_balance("0x4200000000000000000000000000000000000006", "base")
        if weth_bal > Decimal("0.00001"):
            holdings["WETH"] = {
                "address": "0x4200000000000000000000000000000000000006",
                "balance": weth_bal,
            }

        return holdings

    def _unwrap_weth(self, amount: Decimal) -> bool:
        """Unwrap WETH to ETH on Base."""
        if not self.w3 or not self.evm_account:
            return False
        try:
            weth_addr = Web3.to_checksum_address("0x4200000000000000000000000000000000000006")
            weth_abi = [
                {
                    "inputs": [{"name": "wad", "type": "uint256"}],
                    "name": "withdraw",
                    "outputs": [],
                    "stateMutability": "nonpayable",
                    "type": "function",
                },
                {
                    "inputs": [{"name": "", "type": "address"}],
                    "name": "balanceOf",
                    "outputs": [{"name": "", "type": "uint256"}],
                    "stateMutability": "view",
                    "type": "function",
                },
            ]
            contract = self.w3.eth.contract(address=weth_addr, abi=weth_abi)
            amount_wei = int(amount * Decimal(10**18))
            tx = contract.functions.withdraw(amount_wei).build_transaction(
                {
                    "from": self.evm_account.address,
                    "nonce": self.w3.eth.get_transaction_count(self.evm_account.address, "pending"),
                    "gas": 35000,
                    "maxFeePerGas": self.w3.eth.gas_price,
                    "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                    "chainId": 8453,
                }
            )
            signed = self.evm_account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"WETH unwrap tx sent: {tx_hash.hex()}")
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            if receipt.status == 1:
                logger.info(f"WETH unwrap confirmed: {tx_hash.hex()}")
                return True
            else:
                logger.error(f"WETH unwrap failed: {tx_hash.hex()}")
                return False
        except Exception as e:
            logger.error(f"WETH unwrap error: {e}")
            return False

    def _wrap_eth_to_weth(self, amount_eth: float) -> bool:
        """Wrap ETH to WETH on Base. Sends ETH to WETH contract deposit()."""
        if not self.w3 or not self.evm_account:
            logger.warning("[Wrap] No Web3 or EVM account configured")
            return False
        try:
            weth_addr = Web3.to_checksum_address("0x4200000000000000000000000000000000000006")
            amount_wei = int(amount_eth * 1e18)
            # Check native ETH balance
            eth_bal = self.w3.eth.get_balance(self.evm_account.address)
            if eth_bal < amount_wei:
                logger.warning(f"[Wrap] Insufficient ETH: {eth_bal} < {amount_wei}")
                return False
            # deposit() selector: 0xd0e30db0
            tx = {
                "from": self.evm_account.address,
                "to": weth_addr,
                "data": "0xd0e30db0",
                "value": amount_wei,
                "gas": 50000,
                "maxFeePerGas": self.w3.eth.gas_price,
                "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                "nonce": self.w3.eth.get_transaction_count(self.evm_account.address, "pending"),
                "chainId": 8453,
            }
            # Simulate first
            try:
                self.w3.eth.call(tx, "latest")
            except Exception as sim_err:
                logger.warning(f"[Wrap] Simulation failed: {sim_err}")
                return False
            signed = self.evm_account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"[Wrap] WETH deposit tx sent: {tx_hash.hex()}")
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            if receipt.status == 1:
                logger.info(f"[Wrap] WETH deposit confirmed: {tx_hash.hex()}")
                return True
            else:
                logger.error(f"[Wrap] WETH deposit reverted: {tx_hash.hex()}")
                return False
        except Exception as e:
            logger.error(f"[Wrap] ETH->WETH error: {e}")
            return False

    def _wrap_sol_to_wsol(self, amount_sol: float) -> bool:
        """Wrap native SOL to WSOL via Jupiter swap-instructions (creates ATA + wraps)."""
        if not self.solana_adapter or not self.solana_keypair:
            logger.warning("[Wrap] No Solana adapter or keypair configured")
            return False
        try:
            import requests
            import base64
            from solders.instruction import Instruction, AccountMeta
            from solders.message import MessageV0
            from solders.transaction import VersionedTransaction
            from solders.pubkey import Pubkey
            from solana.rpc.types import TxOpts

            wallet = self.solana_keypair.pubkey()
            wsol_mint = Pubkey.from_string("So11111111111111111111111111111111111111112")
            amount_lamports = int(amount_sol * 1e9)

            # Check native SOL balance
            sol_bal = self.solana_adapter.get_balance(str(wallet))
            if sol_bal < amount_sol:
                logger.warning(f"[Wrap] Insufficient SOL: {sol_bal} < {amount_sol}")
                return False

            # Build a self-swap quote (SOL -> WSOL) to get wrap instructions from Jupiter
            quote = self.solana_adapter.jupiter_quote(
                str(wsol_mint), str(wsol_mint), amount_lamports, slippage_bps=10
            )
            if not quote:
                # Fallback: manually create ATA and transfer
                logger.info("[Wrap] Jupiter quote failed, using manual wrap")
                return self._wrap_sol_manual(amount_lamports)

            tx = self.solana_adapter.jupiter_build_tx(quote, wrap_unwrap=True)
            if not tx:
                logger.warning("[Wrap] Jupiter build tx failed")
                return self._wrap_sol_manual(amount_lamports)

            # Simulate
            sim_ok, sim_err = self.solana_adapter.simulate_tx(tx)
            if not sim_ok:
                logger.warning(f"[Wrap] Simulation failed: {sim_err}")
                return self._wrap_sol_manual(amount_lamports)

            sig = self.solana_adapter.send_tx(tx)
            if sig:
                logger.info(f"[Wrap] SOL->WSOL wrap tx sent: {sig}")
                confirmed = self.solana_adapter.confirm_tx(sig)
                if confirmed:
                    logger.info(f"[Wrap] SOL->WSOL wrap confirmed: {sig}")
                    return True
                else:
                    logger.warning(f"[Wrap] SOL->WSOL wrap not confirmed: {sig}")
                    return False
            return False
        except Exception as e:
            logger.error(f"[Wrap] SOL->WSOL error: {e}")
            return False

    def _wrap_sol_manual(self, amount_lamports: int) -> bool:
        """Manual SOL->WSOL wrap: create ATA + transfer + syncNative."""
        if not self.solana_adapter or not self.solana_keypair:
            return False
        try:
            from solders.instruction import Instruction, AccountMeta
            from solders.message import MessageV0
            from solders.transaction import VersionedTransaction
            from solders.pubkey import Pubkey
            from solana.rpc.types import TxOpts

            wallet = self.solana_keypair.pubkey()
            wsol_mint = Pubkey.from_string("So11111111111111111111111111111111111111112")
            token_program = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
            associated_token_program = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
            system_program = Pubkey.from_string("11111111111111111111111111111111")
            rent_sysvar = Pubkey.from_string("SysvarRent111111111111111111111111111111111")

            # Derive WSOL ATA
            seeds = [bytes(wallet), bytes(token_program), bytes(wsol_mint)]
            ata, _ = Pubkey.find_program_address(seeds, associated_token_program)

            # Check if ATA exists
            ata_info = self.solana_adapter.client.get_account_info(ata)
            instructions = []

            if ata_info.value is None:
                # Create ATA instruction
                create_ix = Instruction(
                    program_id=associated_token_program,
                    accounts=[
                        AccountMeta(wallet, is_signer=True, is_writable=True),
                        AccountMeta(ata, is_signer=False, is_writable=True),
                        AccountMeta(wallet, is_signer=False, is_writable=False),
                        AccountMeta(wsol_mint, is_signer=False, is_writable=False),
                        AccountMeta(system_program, is_signer=False, is_writable=False),
                        AccountMeta(token_program, is_signer=False, is_writable=False),
                        AccountMeta(rent_sysvar, is_signer=False, is_writable=False),
                    ],
                    data=bytes([0]),  # CreateIdempotent discriminator
                )
                instructions.append(create_ix)

            # Transfer SOL to ATA (system transfer)
            transfer_ix = Instruction(
                program_id=system_program,
                accounts=[
                    AccountMeta(wallet, is_signer=True, is_writable=True),
                    AccountMeta(ata, is_signer=False, is_writable=True),
                ],
                data=bytes([2, 0, 0, 0]) + amount_lamports.to_bytes(8, "little"),
            )
            instructions.append(transfer_ix)

            # syncNative instruction to mark as wrapped SOL
            sync_ix = Instruction(
                program_id=token_program,
                accounts=[AccountMeta(ata, is_signer=False, is_writable=True)],
                data=bytes([17]),  # syncNative discriminator
            )
            instructions.append(sync_ix)

            blockhash = self.solana_adapter.client.get_latest_blockhash().value.blockhash
            msg = MessageV0.try_compile(
                payer=wallet,
                instructions=instructions,
                address_lookup_table_accounts=[],
                recent_blockhash=blockhash,
            )
            tx = VersionedTransaction(msg, [self.solana_keypair])

            sig = self.solana_adapter.send_tx(tx)
            if sig:
                logger.info(f"[Wrap] Manual SOL->WSOL tx sent: {sig}")
                return self.solana_adapter.confirm_tx(sig)
            return False
        except Exception as e:
            logger.error(f"[Wrap] Manual SOL->WSOL error: {e}")
            return False

    def _sell_via_kyberswap(self, token_name: str, token_address: str, sell_amount: Decimal) -> bool:
        """Fallback sell via KyberSwap when Odos fails."""
        try:
            amount_wei = str(int(sell_amount * Decimal(10**18)))
            weth = "0x4200000000000000000000000000000000000006"

            # Get KyberSwap quote
            quote_url = "https://aggregator-api.kyberswap.com/base/api/v1/routes"
            quote_resp = requests.post(
                quote_url,
                json={
                    "tokenIn": token_address,
                    "tokenOut": weth,
                    "amountIn": amount_wei,
                    "saveGas": False,
                    "slippageTolerance": 500,  # 5%
                },
                timeout=15,
            )

            if quote_resp.status_code != 200:
                logger.error(f"KyberSwap quote failed: {quote_resp.status_code}")
                return False

            route_data = quote_resp.json().get("data", {})
            router_address = route_data.get("routerAddress")

            # Approve KyberSwap router
            if router_address and not self._erc20_approve_if_needed(token_address, router_address, int(amount_wei)):
                logger.error(f"Failed to approve {token_name} for KyberSwap")
                return False

            # Build swap transaction
            build_resp = requests.post(
                "https://aggregator-api.kyberswap.com/base/api/v1/route/build",
                json={"routeSummary": route_data.get("routeSummary")},
                timeout=15,
            )

            if build_resp.status_code != 200:
                logger.error(f"KyberSwap build failed: {build_resp.status_code}")
                return False

            tx_data = build_resp.json().get("data", {})

            tx = {
                "from": self.evm_account.address,
                "to": Web3.to_checksum_address(tx_data.get("routerAddress", router_address)),
                "data": tx_data.get("data"),
                "value": int(tx_data.get("amountIn", 0)),
                "gas": int(tx_data.get("gas", 300000)),
                "maxFeePerGas": self.w3.eth.gas_price,
                "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                "nonce": self.w3.eth.get_transaction_count(self.evm_account.address, "pending"),
                "chainId": 8453,
            }

            signed = self.evm_account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"KyberSwap sell sent: {tx_hash.hex()}")

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status == 1:
                logger.info(f"KyberSwap sell confirmed: {token_name} -> WETH | tx: {tx_hash.hex()}")
                return True
            else:
                logger.error(f"KyberSwap sell failed: {tx_hash.hex()}")
                return False

        except Exception as e:
            logger.error(f"KyberSwap sell error: {e}")
            import traceback

            traceback.print_exc()
            return False

    def _erc20_approve_if_needed(self, token_address: str, spender: str, amount_wei: int) -> bool:
        """Approve ERC20 token spending if allowance is insufficient. Returns True on success."""
        if not self.w3 or not self.evm_account:
            return False
        try:
            erc20_abi = [
                {
                    "inputs": [
                        {"name": "owner", "type": "address"},
                        {"name": "spender", "type": "address"},
                    ],
                    "name": "allowance",
                    "outputs": [{"name": "", "type": "uint256"}],
                    "stateMutability": "view",
                    "type": "function",
                },
                {
                    "inputs": [
                        {"name": "spender", "type": "address"},
                        {"name": "amount", "type": "uint256"},
                    ],
                    "name": "approve",
                    "outputs": [{"name": "", "type": "bool"}],
                    "stateMutability": "nonpayable",
                    "type": "function",
                },
            ]
            token_contract = self.w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=erc20_abi)
            current_allowance = token_contract.functions.allowance(
                self.evm_account.address, Web3.to_checksum_address(spender)
            ).call()
            if current_allowance >= amount_wei:
                logger.info(f"Allowance sufficient: {current_allowance} >= {amount_wei}")
                return True
            # Approve max uint256
            MAX_UINT256 = 2**256 - 1
            tx = token_contract.functions.approve(Web3.to_checksum_address(spender), MAX_UINT256).build_transaction(
                {
                    "from": self.evm_account.address,
                    "nonce": self.w3.eth.get_transaction_count(self.evm_account.address, "pending"),
                    "gas": 60000,
                    "maxFeePerGas": self.w3.eth.gas_price,
                    "maxPriorityFeePerGas": self.w3.eth.max_priority_fee,
                    "chainId": 8453,
                }
            )
            signed = self.evm_account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"Approve tx sent: {tx_hash.hex()}")
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)
            if receipt.status == 1:
                logger.info(f"Approve confirmed: {tx_hash.hex()}")
                return True
            else:
                logger.error(f"Approve failed: {tx_hash.hex()}")
                return False
        except Exception as e:
            logger.error(f"Approve error: {e}")
            return False

    def _direct_cheap_sell(self, token_address: str, amount_wei: int) -> str | None:
        """Try direct on-chain swaps through cheapest AMM routers. Skips simulation to save gas.
        Uses actual router addresses from protocol_registry."""
        if not self.w3 or not self.evm_account:
            return None

        weth = "0x4200000000000000000000000000000000000006"
        addr = self.evm_account.address
        deadline = int(time.time()) + 300
        cheap_gas = {
            "maxFeePerGas": 10000000,
            "maxPriorityFeePerGas": 100000,
            "chainId": 8453,
        }

        # ERC20 approve
        erc20_abi = [
            {
                "inputs": [
                    {"name": "spender", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                ],
                "name": "approve",
                "outputs": [{"name": "", "type": "bool"}],
                "stateMutability": "nonpayable",
                "type": "function",
            },
            {
                "inputs": [
                    {"name": "owner", "type": "address"},
                    {"name": "spender", "type": "address"},
                ],
                "name": "allowance",
                "outputs": [{"name": "", "type": "uint256"}],
                "stateMutability": "view",
                "type": "function",
            },
        ]
        token_contract = self.w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=erc20_abi)

        def ensure_allowance(spender: str):
            current = token_contract.functions.allowance(addr, Web3.to_checksum_address(spender)).call()
            if current < amount_wei:
                approve_tx = token_contract.functions.approve(
                    Web3.to_checksum_address(spender), 2**256 - 1
                ).build_transaction(
                    {
                        "from": addr,
                        "nonce": self.w3.eth.get_transaction_count(addr, "pending"),
                        "gas": 50000,
                        **cheap_gas,
                    }
                )
                signed = self.evm_account.sign_transaction(approve_tx)
                txh = self.w3.eth.send_raw_transaction(signed.raw_transaction)
                receipt = self.w3.eth.wait_for_transaction_receipt(txh, timeout=60)
                if receipt.status != 1:
                    raise Exception(f"Approve failed: {txh.hex()}")

        def send_and_confirm(name: str, tx: dict) -> str | None:
            signed = self.evm_account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            logger.info(f"{name} sell tx sent: {tx_hash.hex()}")
            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            if receipt.status == 1 and receipt.gasUsed > 50000:
                logger.info(f"{name} sell CONFIRMED: {tx_hash.hex()} (gas: {receipt.gasUsed})")
                return tx_hash.hex()
            elif receipt.status == 1:
                logger.warning(
                    f"{name} tx succeeded but gas too low ({receipt.gasUsed}) - likely approve only, not swap"
                )
            else:
                logger.warning(f"{name} sell reverted: {tx_hash.hex()} (gas: {receipt.gasUsed})")
            return None

        # Load router addresses from contract_executor's protocol registry
        try:
            from protocol_registry import PROTOCOL_REGISTRY

            base_protocols = PROTOCOL_REGISTRY.get("base", {})
        except Exception:
            base_protocols = {}

        # SushiSwap RouteProcessor4 (processRoute)
        sushi_cfg = base_protocols.get("sushiswap", {})
        sushi_router = sushi_cfg.get("router", "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891")
        sushi_abi = [
            {
                "inputs": [
                    {"name": "tokenIn", "type": "address"},
                    {"name": "amountIn", "type": "uint256"},
                    {"name": "tokenOut", "type": "address"},
                    {"name": "amountOutMin", "type": "uint256"},
                    {"name": "to", "type": "address"},
                    {"name": "route", "type": "bytes"},
                ],
                "name": "processRoute",
                "outputs": [{"name": "amountOut", "type": "uint256"}],
                "stateMutability": "payable",
                "type": "function",
            }
        ]
        try:
            ensure_allowance(sushi_router)
            router = self.w3.eth.contract(address=Web3.to_checksum_address(sushi_router), abi=sushi_abi)
            tx = router.functions.processRoute(
                Web3.to_checksum_address(token_address),
                amount_wei,
                Web3.to_checksum_address(weth),
                0,
                Web3.to_checksum_address(addr),
                b"",
            ).build_transaction(
                {
                    "from": addr,
                    "nonce": self.w3.eth.get_transaction_count(addr, "pending"),
                    "gas": 300000,
                    **cheap_gas,
                }
            )
            result = send_and_confirm("SushiSwap", tx)
            if result:
                return result
        except Exception as e:
            logger.warning(f"SushiSwap sell failed: {str(e)[:120]}")

        # PancakeSwap V2 (swapExactTokensForTokens)
        pancake_cfg = base_protocols.get("pancakeswap", {})
        pancake_v2 = pancake_cfg.get("router", "0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86")
        V2_ABI = [
            {
                "inputs": [
                    {"name": "amountIn", "type": "uint256"},
                    {"name": "amountOutMin", "type": "uint256"},
                    {"name": "path", "type": "address[]"},
                    {"name": "to", "type": "address"},
                    {"name": "deadline", "type": "uint256"},
                ],
                "name": "swapExactTokensForTokens",
                "outputs": [{"name": "amounts", "type": "uint256[]"}],
                "stateMutability": "nonpayable",
                "type": "function",
            }
        ]
        try:
            ensure_allowance(pancake_v2)
            router = self.w3.eth.contract(address=Web3.to_checksum_address(pancake_v2), abi=V2_ABI)
            tx = router.functions.swapExactTokensForTokens(
                amount_wei,
                0,
                [
                    Web3.to_checksum_address(token_address),
                    Web3.to_checksum_address(weth),
                ],
                Web3.to_checksum_address(addr),
                deadline,
            ).build_transaction(
                {
                    "from": addr,
                    "nonce": self.w3.eth.get_transaction_count(addr, "pending"),
                    "gas": 200000,
                    **cheap_gas,
                }
            )
            result = send_and_confirm("PancakeV2", tx)
            if result:
                return result
        except Exception as e:
            logger.warning(f"PancakeV2 sell failed: {str(e)[:100]}")

        # Aerodrome swapExactTokensForETH - raw calldata with correct selector
        # Selector 0x18a13086 for swapExactTokensForETH(uint256,uint256,(address,address,bool)[],address,uint256)
        aero_router_addr = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43"
        try:
            ensure_allowance(aero_router_addr)
            deadline_ts = int(time.time()) + 1200

            # Build calldata: selector(4) + 5*32 bytes fixed + dynamic array
            sel = bytes.fromhex("18a13086")
            # Fixed params
            amount_enc = amount_wei.to_bytes(32, "big")
            min_out_enc = (0).to_bytes(32, "big")
            array_offset = (5 * 32).to_bytes(32, "big")  # 0xa0
            to_enc = bytes.fromhex(addr[2:].lower().zfill(64))
            deadline_enc = deadline_ts.to_bytes(32, "big")
            # Dynamic: Route[] with 1 element, 3 fields each
            array_len = (1).to_bytes(32, "big")
            from_enc = bytes.fromhex(token_address[2:].lower().zfill(64))
            weth_enc = bytes.fromhex(weth[2:].lower().zfill(64))
            stable_enc = (0).to_bytes(32, "big")

            calldata = (
                sel
                + amount_enc
                + min_out_enc
                + array_offset
                + to_enc
                + deadline_enc
                + array_len
                + from_enc
                + weth_enc
                + stable_enc
            )

            nonce = self.w3.eth.get_transaction_count(addr, "pending")
            tx = {
                "from": addr,
                "to": Web3.to_checksum_address(aero_router_addr),
                "data": calldata,
                "value": 0,
                "gas": 300000,
                "nonce": nonce,
                **cheap_gas,
            }
            result = send_and_confirm("Aerodrome", tx)
            if result:
                return result
        except Exception as e:
            logger.warning(f"Aerodrome swap failed: {str(e)[:120]}")

        # Try Aerodrome via processRoute (SushiRouteProcessor-compatible interface)
        sushi_router = sushi_cfg.get("router", "0x0389879e0156033202C44BF784ac18fC02edeE4f")
        try:
            ensure_allowance(sushi_router)
            router = self.w3.eth.contract(address=Web3.to_checksum_address(sushi_router), abi=sushi_abi)
            # Build actual route: encode pool address for auto-routing
            # SushiSwap processRoute needs route bytes for non-standard tokens
            tx = router.functions.processRoute(
                Web3.to_checksum_address(token_address),
                amount_wei,
                Web3.to_checksum_address(weth),
                0,
                Web3.to_checksum_address(addr),
                b"",
            ).build_transaction(
                {
                    "from": addr,
                    "nonce": self.w3.eth.get_transaction_count(addr, "pending"),
                    "gas": 300000,
                    **cheap_gas,
                }
            )
            result = send_and_confirm("SushiSwap", tx)
            if result:
                return result
        except Exception as e:
            logger.warning(f"SushiSwap sell failed: {str(e)[:120]}")

        # PancakeSwap V3 / Uniswap V3 (exactInputSingle)
        V3_ABI = [
            {
                "inputs": [
                    {
                        "components": [
                            {"name": "tokenIn", "type": "address"},
                            {"name": "tokenOut", "type": "address"},
                            {"name": "fee", "type": "uint24"},
                            {"name": "recipient", "type": "address"},
                            {"name": "deadline", "type": "uint256"},
                            {"name": "amountIn", "type": "uint256"},
                            {"name": "amountOutMinimum", "type": "uint256"},
                            {"name": "sqrtPriceLimitX96", "type": "uint160"},
                        ],
                        "name": "params",
                        "type": "tuple",
                    }
                ],
                "name": "exactInputSingle",
                "outputs": [{"name": "amountOut", "type": "uint256"}],
                "stateMutability": "payable",
                "type": "function",
            }
        ]
        for fee in [500, 2500, 3000, 10000]:
            try:
                ensure_allowance(pancake_cfg.get("v3_router", "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4"))
                router = self.w3.eth.contract(
                    address=Web3.to_checksum_address(
                        pancake_cfg.get("v3_router", "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4")
                    ),
                    abi=V3_ABI,
                )
                params = (
                    Web3.to_checksum_address(token_address),
                    Web3.to_checksum_address(weth),
                    fee,
                    Web3.to_checksum_address(addr),
                    deadline,
                    amount_wei,
                    0,
                    0,
                )
                tx = router.functions.exactInputSingle(params).build_transaction(
                    {
                        "from": addr,
                        "nonce": self.w3.eth.get_transaction_count(addr, "pending"),
                        "gas": 250000,
                        **cheap_gas,
                    }
                )
                result = send_and_confirm(f"PancakeV3-{fee}", tx)
                if result:
                    return result
            except Exception as e:
                logger.warning(f"PancakeV3-{fee} sell failed: {str(e)[:100]}")

        # Uniswap V3 (exactInputSingle) - multiple fee tiers
        uni_cfg = base_protocols.get("uniswap_v3", {})
        uni_router = uni_cfg.get("router", "0x2626664c2603336E57B271c5C0b26F421741e481")
        for fee in [100, 500, 3000, 10000]:
            try:
                ensure_allowance(uni_router)
                router = self.w3.eth.contract(address=Web3.to_checksum_address(uni_router), abi=V3_ABI)
                params = (
                    Web3.to_checksum_address(token_address),
                    Web3.to_checksum_address(weth),
                    fee,
                    Web3.to_checksum_address(addr),
                    deadline,
                    amount_wei,
                    0,
                    0,
                )
                tx = router.functions.exactInputSingle(params).build_transaction(
                    {
                        "from": addr,
                        "nonce": self.w3.eth.get_transaction_count(addr, "pending"),
                        "gas": 250000,
                        **cheap_gas,
                    }
                )
                result = send_and_confirm(f"UniV3-{fee}", tx)
                if result:
                    return result
            except Exception as e:
                logger.warning(f"UniV3-{fee} sell failed: {str(e)[:100]}")

        return None

    def sell_token_for_eth(
        self,
        token_name: str,
        token_address: str,
        sell_pct: float = 0.3,
        known_balance: Decimal = None,
    ) -> bool:
        """Sell a portion of a token holding to free up ETH for gas and trading.

        Priority: Direct on-chain AMM swaps (cheapest gas) -> Aggregator APIs (last resort)
        """
        if known_balance and known_balance > Decimal("0"):
            token_bal = known_balance
        else:
            token_bal = self.get_token_balance(token_address, "base")
        if token_bal <= Decimal("0"):
            logger.warning(f"No {token_name} balance to sell")
            return False

        sell_amount = token_bal * Decimal(str(sell_pct))
        logger.info(f"SELLING {sell_amount:.4f} {token_name} ({sell_pct*100:.0f}% of {token_bal:.4f}) to free up ETH")
        amount_wei = int(sell_amount * Decimal(10**18))

        # 1. Try direct on-chain AMM swaps (cheapest gas, no API overhead)
        result = self._direct_cheap_sell(token_address, amount_wei)
        if result:
            return True

        # 2. Last resort: aggregator APIs (higher gas due to complex routing)
        logger.warning(f"All direct swaps failed for {token_name}, trying aggregators")
        for agg_name, agg_func in [
            ("KyberSwap", self._sell_via_kyberswap),
            ("Odos", self._sell_via_odos),
        ]:
            try:
                if agg_func(token_name, token_address, sell_amount):
                    return True
            except Exception as e:
                logger.warning(f"{agg_name} sell failed: {e}")

        logger.error(f"All routes failed to sell {token_name}")
        return False

    def _sell_via_odos(self, token_name: str, token_address: str, sell_amount: Decimal) -> bool:
        """Sell via Odos API (higher gas, last resort)."""
        try:
            amount_wei = str(int(sell_amount * Decimal(10**18)))

            # Get quote from Odos
            quote_resp = requests.post(
                "https://api.odos.xyz/sor/quote/v2",
                json={
                    "chainId": 8453,
                    "inputTokens": [{"tokenAddress": token_address, "amount": str(amount_wei)}],
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
                try:
                    err_body = quote_resp.json()
                    logger.error(
                        f"Odos sell quote failed: {quote_resp.status_code} - {err_body.get('detail', err_body.get('message', quote_resp.text[:200]))}"
                    )
                except Exception:
                    logger.error(f"Odos sell quote failed: {quote_resp.status_code} - {quote_resp.text[:200]}")
                # Try KyberSwap as fallback
                return self._sell_via_kyberswap(token_name, token_address, sell_amount)

            quote = quote_resp.json()

            # Approve Odos router to spend token before assembling
            odos_router = quote.get("transaction", {}).get("to", "0x19960B582773B319a29d7e1f9D7057D0C643396C")
            if not self._erc20_approve_if_needed(token_address, odos_router, int(amount_wei)):
                logger.error(f"Failed to approve {token_name} for Odos router")
                return False

            # Wait for approve to mine before swapping
            time.sleep(3)

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
            logger.info(f"Odos tx data: to={tx_data.get('to')}, value={tx_data.get('value')}, gas={tx_data.get('gas')}")

            tx = {
                "from": self.evm_account.address,
                "to": Web3.to_checksum_address(tx_data.get("to")),
                "data": tx_data.get("data"),
                "value": 0,  # Selling ERC20, no ETH value needed
                "gas": int(tx_data.get("gas", 300000)),
                "maxFeePerGas": 10000000,  # 0.01 gwei for Base L2
                "maxPriorityFeePerGas": 100000,
                "nonce": self.w3.eth.get_transaction_count(self.evm_account.address, "latest"),
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

        # ---- AUTO-WRAP: If WETH balance is 0 but we have ETH, wrap some ----
        try:
            weth_bal = self.get_token_balance("0x4200000000000000000000000000000000000006", "base")
            if weth_bal <= 0:
                eth_bal = self.get_balance("base")
                wrap_amount = min(eth_amount * 1.2, float(eth_bal) * 0.8)
                if wrap_amount > 0.00001:
                    logger.info(f"[AutoWrap] WETH=0, wrapping {wrap_amount:.6f} ETH -> WETH")
                    wrapped = self._wrap_eth_to_weth(wrap_amount)
                    if wrapped:
                        logger.info("[AutoWrap] ETH wrapped successfully")
                        time.sleep(2)
                    else:
                        logger.warning("[AutoWrap] ETH wrap failed, proceeding anyway")
        except Exception as wrap_err:
            logger.debug(f"[AutoWrap] Pre-flight wrap check error: {wrap_err}")

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

        SOL_MINT = "So11111111111111111111111111111111111111112"
        amount_base = int(sol_amount * 1e9)

        # ---- AUTO-WRAP: If WSOL balance is 0 but we have SOL, wrap some ----
        try:
            sol_bal = self.get_balance("solana")
            if self.solana_adapter:
                wallet = str(self.solana_keypair.pubkey())
                wsol_bal = self.solana_adapter.get_token_balance(SOL_MINT, wallet)
            else:
                wsol_bal = 0
            if wsol_bal <= 0 and sol_bal > 0.001:
                wrap_amount = min(sol_amount * 1.2, sol_bal * 0.8)
                if wrap_amount > 0.0001:
                    logger.info(f"[AutoWrap] WSOL=0, wrapping {wrap_amount:.4f} SOL -> WSOL")
                    wrapped = self._wrap_sol_to_wsol(wrap_amount)
                    if wrapped:
                        logger.info("[AutoWrap] SOL wrapped successfully")
                        time.sleep(2)
                    else:
                        logger.warning("[AutoWrap] SOL wrap failed, proceeding anyway")
        except Exception as wrap_err:
            logger.debug(f"[AutoWrap] Pre-flight wrap check error: {wrap_err}")

        # === PRIMARY: Direct program execution via Solana adapter ===
        if self.solana_adapter:
            try:
                logger.info(f"[Solana] Direct program swap: {sol_amount} SOL -> {token_symbol}")

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

    def sell_solana_token(self, token_symbol: str, token_mint: str, sell_pct: float = 1.0) -> bool:
        """Sell a Solana token back to SOL using multi-DEX routing.

        Tries: Jupiter -> Raydium -> Meteora -> Orca -> PumpSwap
        """
        SOL_MINT = "So11111111111111111111111111111111111111112"

        if not self.solana_keypair:
            logger.error("[Solana Sell] No Solana wallet configured")
            return False

        try:

            wallet = str(self.solana_keypair.pubkey())

            # Get token balance
            if self.solana_adapter:
                balance = self.solana_adapter.get_token_balance(token_mint, wallet)
            else:
                balance = 0

            if balance <= 0:
                logger.warning(f"[Solana Sell] No {token_symbol} balance to sell")
                return False

            sell_amount = int(balance * sell_pct)
            logger.info(f"[Solana Sell] Selling {sell_pct*100:.0f}% of {token_symbol}: " f"{sell_amount} units")

            # === Route 1: Jupiter (aggregator, best price) ===
            try:
                if self.solana_adapter:
                    sig = self.solana_adapter.swap(
                        input_mint=token_mint,
                        output_mint=SOL_MINT,
                        amount=sell_amount,
                        slippage_bps=200,  # 2% slippage for sells
                    )
                    if sig:
                        logger.info(f"[Solana Sell] Jupiter sell confirmed: {sig}")
                        return True
            except Exception as e:
                logger.warning(f"[Solana Sell] Jupiter failed: {e}")

            # === Route 2: Jupiter CLI ===
            try:
                import subprocess

                token_amount = sell_amount / 1e9  # Convert to human-readable
                cmd = [
                    "/home/terexitarius/.hermes/node/bin/jup",
                    "spot",
                    "swap",
                    "--from",
                    token_mint,
                    "--to",
                    "SOL",
                    "--amount",
                    str(token_amount),
                    "--slippage",
                    "2",
                ]
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
                    logger.info("[Solana Sell] Jupiter CLI sell successful")
                    return True
            except Exception as e:
                logger.warning(f"[Solana Sell] Jupiter CLI failed: {e}")

            # === Route 3: Raydium direct ===
            try:
                if self.solana_adapter:
                    ray_quote = self.solana_adapter.raydium_cpmm_quote(
                        token_mint, SOL_MINT, sell_amount, slippage_bps=200
                    )
                    if ray_quote:
                        tx = self.solana_adapter.raydium_build_tx(ray_quote)
                        if tx:
                            sig = self.solana_adapter.send_tx(tx)
                            if sig:
                                logger.info(f"[Solana Sell] Raydium sell confirmed: {sig}")
                                return True
            except Exception as e:
                logger.warning(f"[Solana Sell] Raydium failed: {e}")

            # === Route 4: Meteora DLMM ===
            try:
                if self.solana_adapter:
                    met_quote = self.solana_adapter.meteora_quote(token_mint, SOL_MINT, sell_amount, slippage_bps=200)
                    if met_quote and met_quote.get("pool"):
                        tx_b64 = self.solana_adapter.meteora_build_tx(met_quote, wallet, sell_amount, slippage_bps=200)
                        if tx_b64:
                            import base64

                            from solders.transaction import VersionedTransaction

                            tx_bytes = base64.b64decode(tx_b64)
                            tx = VersionedTransaction.from_bytes(tx_bytes)
                            signed_tx = VersionedTransaction(tx.message, [self.solana_keypair])
                            sig = self.solana_adapter.send_tx(signed_tx)
                            if sig:
                                logger.info(f"[Solana Sell] Meteora sell confirmed: {sig}")
                                return True
            except Exception as e:
                logger.warning(f"[Solana Sell] Meteora failed: {e}")

            # === Route 5: Orca Whirlpool ===
            try:
                if self.solana_adapter:
                    orc_quote = self.solana_adapter.orca_quote(token_mint, SOL_MINT, sell_amount, slippage_bps=200)
                    if orc_quote and orc_quote.get("pool"):
                        tx_b64 = self.solana_adapter.orca_build_tx(orc_quote, wallet, sell_amount, slippage_bps=200)
                        if tx_b64:
                            import base64

                            from solders.transaction import VersionedTransaction

                            tx_bytes = base64.b64decode(tx_b64)
                            tx = VersionedTransaction.from_bytes(tx_bytes)
                            signed_tx = VersionedTransaction(tx.message, [self.solana_keypair])
                            sig = self.solana_adapter.send_tx(signed_tx)
                            if sig:
                                logger.info(f"[Solana Sell] Orca sell confirmed: {sig}")
                                return True
            except Exception as e:
                logger.warning(f"[Solana Sell] Orca failed: {e}")

            logger.error(f"[Solana Sell] All routes failed for {token_symbol}")
            return False

        except Exception as e:
            logger.error(f"[Solana Sell] Error: {e}")
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
                # Trigger sell if ETH < $0.05 (~0.00002 ETH) — need gas buffer for multiple trades
                if base_bal < Decimal("0.00002") and holdings:
                    for tok_name, tok_info in holdings.items():
                        if tok_name == "WETH":
                            # Unwrap WETH to ETH
                            if tok_info["balance"] > Decimal("0.00001"):
                                logger.info(f"Unwrapping {tok_info['balance']:.6f} WETH to ETH")
                                self._unwrap_weth(tok_info["balance"])
                                time.sleep(2)
                                base_bal = self.get_balance("base")
                            continue
                        if tok_name in active_positions:
                            continue  # Don't sell active positions
                        logger.info(f"ETH low ({base_bal:.6f}), selling some {tok_name} to free up capital")
                        sold = self.sell_token_for_eth(
                            tok_name,
                            tok_info["address"],
                            sell_pct=0.5,
                            known_balance=tok_info["balance"],
                        )
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
                            if token_addr and base_bal > Decimal("0.000005"):
                                logger.info(f"Rotating: selling {token} to chase faster movers")
                                sold = self.sell_token_for_eth(token, token_addr, sell_pct=1.0)
                                if sold:
                                    del active_positions[token]
                                    time.sleep(3)
                                    base_bal = self.get_balance("base")

                # ==================== SIGNAL-BASED TRADING ====================
                try:
                    from signal_providers import (
                        ScreenerPipelineProvider,
                        aggregate_signals,
                    )

                    signals = aggregate_signals()

                    # Also add screener tokens directly (bypass merge which loses details)
                    screener_sigs = ScreenerPipelineProvider().fetch()
                    for ss in screener_sigs:
                        if ss["action"] == "BUY" and ss["confidence"] >= 0.5 and ss.get("token_address"):
                            # Check not already in signals
                            if not any(s.get("token") == ss["token"] for s in signals):
                                signals.append(ss)

                    logger.info(f"Signals: {len(signals)}")

                    for signal in signals:
                        token = signal.get("token", "?")
                        action = signal.get("action", "?")
                        conf = signal.get("confidence", 0)
                        chain = signal.get("chain", "base")
                        src = signal.get("source", "?")
                        logger.info(f"  Signal: {token} {action} conf={conf:.2f} chain={chain} src={src}")

                        # Only trade on high-confidence BUY signals
                        # Screener tokens already filtered, use lower threshold for them
                        min_conf = 0.5 if signal.get("source") == "Screener" else 0.7
                        if action == "BUY" and conf >= min_conf:
                            # Use token_address from signal if available (Dexscreener, SmartMoney)
                            token_addr = signal.get("token_address") or self.get_token_address(token, chain)

                            traded = False

                            if chain == "base" and base_bal > Decimal("0.00002"):
                                # Trade 50% of ETH balance
                                trade_amount = float(base_bal) * 0.5

                                # Check if trade is meaningful (> ~$0.01 to avoid micro trades)
                                if trade_amount > 0.000005:
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

                            elif chain == "solana" and sol_bal > Decimal("0.001"):
                                # Trade 50% of SOL balance
                                trade_amount = float(sol_bal) * 0.5

                                # Check if trade is meaningful (> ~$0.03 to avoid micro trades)
                                if trade_amount > 0.0002:
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
                                if chain == "base" and base_bal <= Decimal("0.00002"):
                                    logger.warning(
                                        f"Insufficient Base balance ({base_bal:.8f} ETH) for {token} - need >0.00002 ETH (~$0.05)"
                                    )
                                elif chain == "solana" and sol_bal <= Decimal("0.001"):
                                    logger.warning(
                                        f"Insufficient Solana balance ({sol_bal:.6f} SOL) for {token} - need >0.001 SOL (~$0.15)"
                                    )

                        elif action == "BUY" and conf < 0.7:
                            logger.debug(f"Skipping {token}: confidence {conf:.2f} < 0.70 threshold")

                except Exception as e:
                    logger.error(f"Signal error: {e}")
                    import traceback

                    traceback.print_exc()

                # Log funding status if no trades were possible
                if base_bal < Decimal("0.00002") and sol_bal < Decimal("0.001"):
                    logger.warning(
                        f"LOW FUNDS - cannot trade on either chain. Base: {base_bal:.8f} ETH, Solana: {sol_bal:.6f} SOL"
                    )
                elif base_bal < Decimal("0.00002") and not holdings:
                    logger.info(f"Base balance low ({base_bal:.8f} ETH) and no token holdings to sell")

                # ==================== BRIDGING OPPORTUNITIES ====================
                # Check if we should bridge between chains
                if base_bal > Decimal("0.0001") and sol_bal < Decimal("0.001"):
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

                elif sol_bal > Decimal("0.001") and base_bal < Decimal("0.00002"):
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
                if base_bal > Decimal("0.0002") and not active_positions:
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
                screener_tokens = self._load_screener_tokens()
                dca_tokens = list(screener_tokens.keys())[:3]  # Top 3 screener tokens for DCA
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
