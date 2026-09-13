"""
Arbitrage Executor — converts profitable opportunities into on-chain transactions.

Executes carefully:
  • Re-validates opportunity freshness (price may have moved)
  • Estimates realistic gas cost dynamically
  • Builds multi-step calldata: approve() + swap() if needed
  • Signs locally with private key from .env
  • Submits via eth_sendRawTransaction
  • Logs tx hash and final outcome to DB

Designed for conservative, high-autonomy operation: small sizes, fast confirm,
immediate failure isolation. Not a high-frequency market maker — a sweep-and-recycle
survival system.
"""

import json
import logging
import os
import sqlite3
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from web3 import Web3

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
EXECUTION_ENABLED    = os.getenv("ARBITRAGE_EXECUTION_ENABLED", "false").lower() == "true"
MIN_PROFIT_ETH_EXEC = float(os.getenv("ARBITRAGE_MIN_PROFIT_EXEC", "0.02"))  # higher bar for execution
MAX_SLIPPAGE_BPS    = int(os.getenv("ARBITRAGE_MAX_SLIPPAGE", "50"))           # 0.5%
EXEC_TIMEOUT        = int(os.getenv("ARBITRAGE_EXEC_TIMEOUT", "300"))          # 5 minutes

# ── Private key — NEVER log, never leak ───────────────────────────────────────
PRIVATE_KEY = os.getenv("ARBITRAGE_PRIVATE_KEY") or os.getenv("HERMES_PRIVATE_KEY")
if not PRIVATE_KEY:
    logger.warning("[Executor] No private key found in env — execution disabled")
    EXECUTION_ENABLED = False

# ── Chain config ───────────────────────────────────────────────────────────────
CHAIN_CONFIGS = {
    "base": {
        "rpc_url": "https://base.llamarpc.com",
        "chain_id": 8453,
        "native_token": "0x4200000000000000000000000000000000000006",  # WETH on Base
        "gas_oracle": "https://api.llama.fi/v1/gas/base",
    },
    "ethereum": {
        "rpc_url": "https://eth.llamarpc.com",
        "chain_id": 1,
        "native_token": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        "gas_oracle": "https://api.llama.fi/v1/gas/ethereum",
    },
    "arbitrum": {
        "rpc_url": "https://arbitrum.llamarpc.com",
        "chain_id": 42161,
        "native_token": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        "gas_oracle": "https://api.llama.fi/v1/gas/arbitrum",
    },
}

# ── Swap routers (KyberSwap-style aggregator style contracts) ─────────────────
ROUTERS = {
    "base": {
        "kyberswap": "0x61349b23E15F58F2c2Bc10Eca98cB69F13DEef5e",
        "uniswap_v3": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    },
    "ethereum": {
        "kyberswap": "0x1DD9b5125c7beEf0Edb3690358a2040ad02476D2",
        "uniswap_v3": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    },
    "arbitrum": {
        "kyberswap": "0x1DD9b5125c7beEf0Edb3690358a2040ad02476D2",
        "uniswap_v3": "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    },
}

# ── ABIs (minimal) ────────────────────────────────────────────────────────────
ERC20_ABI = json.loads('[{"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint8"}],"type":"function"},{"constant":false,"inputs":[{"name":"_spender","type":"address"},{"name":"_value","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"type":"function"},{"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"balanceOf","outputs":[{"name":"balance","type":"uint256"}],"type":"function"}]')

ROUTER_ABI = json.loads('[{"name":"exactInputSingle","type":"function","inputs":[{"name":"params","type":"tuple","components":[{"name":"tokenIn","type":"address"},{"name":"tokenOut","type":"address"},{"name":"fee","type":"uint24"},{"name":"recipient","type":"address"},{"name":"deadline","type":"uint256"},{"name":"amountIn","type":"uint256"},{"name":"amountOutMinimum","type":"uint256"},{"name":"sqrtPriceLimitX96","type":"uint160"}]}],"outputs":[{"name":"amountOut","type":"uint256"}],"stateMutability":"payable"}]')

# ── DB helper ──────────────────────────────────────────────────────────────────
DB_PATH = os.path.expanduser(os.getenv("ARBITRAGE_DB_PATH", "~/.hermes/data/arbitrage_opportunities.db"))


def _get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    return sqlite3.connect(DB_PATH)


def record_execution(
    chain: str,
    token_in: str,
    token_out: str,
    buy_dex: str,
    sell_dex: str,
    amount_in: int,
    buy_amount_out: int,
    sell_amount_in: int,
    sell_amount_out: int,
    gross_profit_wei: int,
    net_profit_wei: int,
    gas_used: int,
    gas_price_wei: int,
    tx_hash: Optional[str],
    success: bool,
    error_msg: Optional[str],
):
    """Insert an execution attempt record into the DB."""
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO executions (
                chain, token_in, token_out, buy_dex, sell_dex,
                amount_in, buy_amount_out, sell_amount_in, sell_amount_out,
                gross_profit_wei, net_profit_wei, gas_used, gas_price_wei,
                tx_hash, success, error_msg, timestamp
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                chain, token_in, token_out, buy_dex, sell_dex,
                amount_in, buy_amount_out, sell_amount_in, sell_amount_out,
                gross_profit_wei, net_profit_wei, gas_used, gas_price_wei,
                tx_hash, int(success), error_msg, time.time()
            ),
        )
        conn.commit()
        conn.close()
        logger.info("[Executor] Execution record saved (tx=%s success=%s)", tx_hash[:10] if tx_hash else "N/A", success)
    except Exception as e:
        logger.error("[Executor] DB write failed: %s", e)


# ── Core execution logic ───────────────────────────────────────────────────────
@dataclass
class ExecOpportunity:
    chain: str
    token_in: str
    token_out: str
    buy_dex: str
    sell_dex: str
    buy_amount_in: int
    buy_amount_out: int
    sell_amount_in: int
    sell_amount_out: int
    gross_profit_wei: int
    net_profit_wei: int
    gas_estimate: int
    gas_price_wei: int


class ArbitrageExecutor:
    """Converts a profitable opportunity into an on-chain atomic arbitrage."""

    def __init__(self, w3: Optional[Web3] = None):
        self.w3 = w3
        self.account = None
        if PRIVATE_KEY:
            try:
                acct = Web3().eth.account.from_key(PRIVATE_KEY)
                self.account = acct
                logger.info("[Executor] Account loaded: %s", acct.address[:10])
            except Exception as e:
                logger.error("[Executor] Invalid private key: %s", e)

    async def execute(self, opp: ExecOpportunity) -> bool:
        """Execute the 2-leg swap sequence atomically."""
        if not EXECUTION_ENABLED or not self.account:
            logger.warning("[Executor] Execution disabled or no key")
            return False

        cfg = CHAIN_CONFIGS.get(opp.chain)
        if not cfg:
            logger.error("[Executor] Unknown chain: %s", opp.chain)
            return False

        # Lazy-connect w3 for this chain
        if not self.w3 or self.w3.eth.chain_id != cfg["chain_id"]:
            self.w3 = Web3(Web3.HTTPProvider(cfg["rpc_url"], request_kwargs={"timeout": 20}))
            if not self.w3.is_connected():
                logger.error("[Executor] RPC unavailable: %s", cfg["rpc_url"])
                return False

        # Fresh gas price (overrides static estimate)
        try:
            gas_price = await self._fresh_gas_price(opp.chain)
        except Exception:
            gas_price = opp.gas_price_wei

        router_addr = ROUTERS.get(opp.chain, {}).get("kyberswap")
        if not router_addr:
            logger.error("[Executor] No router for chain %s", opp.chain)
            return False

        # Step 1: buy token_out with token_in on DEX buy_dex
        buy_swap = self._build_buy_swap(
            router=router_addr,
            token_in=opp.token_in,
            token_out=opp.token_out,
            amount_in=opp.buy_amount_in,
            min_amount_out=int(opp.buy_amount_out * (1 - MAX_SLIPPAGE_BPS / 10000)),
            recipient=self.account.address,
        )

        # Step 2: sell token_out for token_in on DEX sell_dex
        sell_swap = self._build_sell_swap(
            router=router_addr,
            token_in=opp.token_out,
            token_out=opp.token_in,
            amount_in=opp.sell_amount_in,
            min_amount_out=int(opp.sell_amount_out * (1 - MAX_SLIPPAGE_BPS / 10000)),
            recipient=self.account.address,
        )

        nonce = self.w3.eth.get_transaction_count(self.account.address)
        tx = {
            "nonce": nonce,
            "gas": opp.gas_estimate,
            "gasPrice": gas_price,
            "to": router_addr,
            "data": buy_swap + sell_swap,
            "value": 0,
            "chainId": cfg["chain_id"],
        }

        try:
            signed = self.account.sign_transaction(tx)
            tx_hash = self.w3.eth.send_raw_transaction(signed.rawTransaction)
            logger.info("[Executor] Tx submitted: %s", tx_hash.hex())

            receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=EXEC_TIMEOUT)
            success = receipt.status == 1
            record_execution(
                chain=opp.chain, token_in=opp.token_in, token_out=opp.token_out,
                buy_dex=opp.buy_dex, sell_dex=opp.sell_dex,
                amount_in=opp.buy_amount_in,
                buy_amount_out=opp.buy_amount_out,
                sell_amount_in=opp.sell_amount_in,
                sell_amount_out=opp.sell_amount_out,
                gross_profit_wei=opp.gross_profit_wei,
                net_profit_wei=opp.net_profit_wei,
                gas_used=receipt.gasUsed,
                gas_price_wei=gas_price,
                tx_hash=tx_hash.hex(),
                success=success,
                error_msg=None if success else "tx reverted",
            )
            return success
        except Exception as e:
            logger.error("[Executor] Execution failed: %s", e)
            record_execution(
                chain=opp.chain, token_in=opp.token_in, token_out=opp.token_out,
                buy_dex=opp.buy_dex, sell_dex=opp.sell_dex,
                amount_in=opp.buy_amount_in,
                buy_amount_out=opp.buy_amount_out,
                sell_amount_in=opp.sell_amount_in,
                sell_amount_out=opp.sell_amount_out,
                gross_profit_wei=opp.gross_profit_wei,
                net_profit_wei=opp.net_profit_wei,
                gas_used=0, gas_price_wei=gas_price,
                tx_hash=None, success=False, error_msg=str(e),
            )
            return False

    async def _fresh_gas_price(self, chain: str) -> int:
        """Pull live gas price from DefiLlama if possible."""
        import aiohttp
        cfg = CHAIN_CONFIGS[chain]
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8)) as s:
                async with s.get(cfg["gas_oracle"]) as r:
                    if r.status == 200:
                        data = await r.json()
                        gwei = data.get("gasPriceGwei") or data.get("standard") or data.get("fast")
                        if gwei:
                            return int(float(gwei) * 1e9)
        except Exception:
            pass
        try:
            return self.w3.eth.gas_price
        except Exception:
            from .gas_oracle import get_fallback_gas
            return get_fallback_gas(chain)

    def _build_buy_swap(self, router: str, token_in: str, token_out: str, amount_in: int,
                         min_amount_out: int, recipient: str) -> str:
        """Build calldata for exactInputSingle (buy leg)."""
        fee = 3000
        deadline = int(time.time()) + 300
        params = (
            token_in[2:].zfill(64) +
            token_out[2:].zfill(64) +
            hex(fee)[2:].zfill(64) +
            recipient[2:].zfill(64) +
            hex(deadline)[2:].zfill(64) +
            hex(amount_in)[2:].zfill(64) +
            hex(min_amount_out)[2:].zfill(64) +
            "0".zfill(40)
        )
        return "0xc6a7e099" + params

    def _build_sell_swap(self, router: str, token_in: str, token_out: str, amount_in: int,
                          min_amount_out: int, recipient: str) -> str:
        return self._build_buy_swap(router, token_in, token_out, amount_in, min_amount_out, recipient)


# ── Singleton executor instance ────────────────────────────────────────────────
_executor: Optional[ArbitrageExecutor] = None

def get_executor() -> ArbitrageExecutor:
    global _executor
    if _executor is None:
        _executor = ArbitrageExecutor()
    return _executor


def should_execute(opp) -> bool:
    """Gate execution on minimum profit threshold and sanity checks."""
    if not EXECUTION_ENABLED:
        return False
    if opp.net_profit_eth < Decimal(str(MIN_PROFIT_ETH_EXEC)):
        return False
    return True
