#!/usr/bin/env python3
"""
DEX Arbitrage Executor: executes two-leg cross-pool arbitrage trades.
Defaults to dry_run=True; live execution is opt-in.
"""

import json
import logging
import ssl
import time
import urllib.request
from decimal import Decimal
from typing import Optional

from .arbitrage_scanner import CHAIN_RPCS, ArbOpportunity, _rpc_indices, ssl_ctx
from hermes_screener import tor_config  # noqa: F401

logger = logging.getLogger(__name__)

# WETH/USDC pool on Base for ETH price lookups (Uniswap V3 500bps)
_ETH_USDC_POOL_BASE = "0xd0b53D9277642d899DF5C87A3966A349A798F224"


def _rpc_call_exec(chain: str, method: str, params: list = None) -> dict:
    """JSON-RPC call for executor module."""
    if params is None:
        params = []
    rpcs = CHAIN_RPCS.get(chain, [])
    if not rpcs:
        return {"error": f"no RPCs for chain {chain}"}
    idx = _rpc_indices.get(chain, 0)
    for _ in range(len(rpcs) * 2):
        url = rpcs[idx % len(rpcs)]
        try:
            payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Mozilla/5.0",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as resp:
                return json.loads(resp.read().decode())
        except Exception:
            idx += 1
            time.sleep(0.5)
    _rpc_indices[chain] = idx
    return {"error": "rpc_failed"}


def get_eth_price_usd(chain: str) -> float:
    """
    Fetch ETH/USDC spot price from a reliable on-chain pool using direct RPC.
    Returns price in USD per ETH.
    """
    pool = _ETH_USDC_POOL_BASE
    try:
        result_raw = None
        rpcs = CHAIN_RPCS.get(chain, [])
        for rpc in rpcs:
            try:
                payload = json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "method": "eth_call",
                        "params": [{"to": pool, "data": "0x3850c7bd"}, "latest"],
                        "id": 1,
                    }
                ).encode()
                req = urllib.request.Request(
                    rpc,
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=10, context=ssl_ctx) as resp:
                    r = json.loads(resp.read().decode())
                    result_raw = r.get("result", "")
                    if result_raw and len(result_raw) >= 66:
                        break
            except Exception:
                continue

        if result_raw and len(result_raw) >= 66:
            sqrt = int(result_raw[:66], 16)
            if sqrt > 0:
                # WETH (dec=18) / USDC (dec=6): dec0=18, dec1=6 => adjust by 10^(18-6)=10^12
                price_raw = (sqrt / (2**96)) ** 2 * (10 ** (18 - 6))
                # slot0 gives USDC per WETH in this pool orientation; invert if needed
                # Uniswap V3: token0 < token1. USDC < WETH by address, so token0=USDC, token1=WETH
                # price = (sqrt/2^96)^2 * 10^(dec0-dec1) = WETH per USDC * 10^(6-18) correction
                # Simpler: recompute correctly
                # price_token1_per_token0 = (sqrt/2^96)^2
                # token0=USDC(6), token1=WETH(18)
                # adjusted = price_token1_per_token0 * 10^(dec0-dec1) = WETH/USDC * 10^(6-18)
                price_weth_per_usdc = (sqrt / (2**96)) ** 2 * (10 ** (6 - 18))
                if price_weth_per_usdc > 0:
                    eth_usd = 1.0 / price_weth_per_usdc
                    if 100 < eth_usd < 100_000:
                        return eth_usd
    except Exception as e:
        logger.warning(f"ETH price fetch failed: {e}")

    logger.warning("Using fallback ETH price of 3000 USD")
    return 3000.0


def _execute_v2_swap(
    token_in: str,
    token_out: str,
    amount_in_wei: int,
    min_out_wei: int,
    router: str,
    wallet_address: str,
    private_key: str,
    chain: str,
) -> str | None:
    """Execute a V2 swapExactTokensForTokens. Returns tx_hash or None."""
    try:
        from eth_account import Account
        from web3 import Web3

        rpcs = CHAIN_RPCS.get(chain, [])
        w3 = None
        for rpc in rpcs:
            try:
                _w3 = Web3(Web3.HTTPProvider(rpc, request_kwargs={"timeout": 10}))
                if _w3.is_connected():
                    w3 = _w3
                    break
            except Exception:
                continue

        if not w3:
            logger.error(f"Cannot connect to {chain} RPC")
            return None

        account = Account.from_key(private_key)
        deadline = int(time.time()) + 300
        chain_ids = {"base": 8453, "ethereum": 1, "arbitrum": 42161}
        chain_id = chain_ids.get(chain, 8453)

        V2_ABI = [
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
            }
        ]

        ERC20_APPROVE_ABI = [
            {
                "type": "function",
                "name": "approve",
                "stateMutability": "nonpayable",
                "inputs": [
                    {"name": "spender", "type": "address"},
                    {"name": "amount", "type": "uint256"},
                ],
                "outputs": [{"name": "", "type": "bool"}],
            }
        ]

        # Approve
        token_contract = w3.eth.contract(address=Web3.to_checksum_address(token_in), abi=ERC20_APPROVE_ABI)
        approve_tx = token_contract.functions.approve(
            Web3.to_checksum_address(router), amount_in_wei
        ).build_transaction(
            {
                "from": account.address,
                "nonce": w3.eth.get_transaction_count(account.address, "pending"),
                "gas": 60000,
                "maxFeePerGas": w3.eth.gas_price,
                "maxPriorityFeePerGas": w3.eth.max_priority_fee,
                "chainId": chain_id,
            }
        )
        signed_approve = account.sign_transaction(approve_tx)
        approve_hash = w3.eth.send_raw_transaction(signed_approve.raw_transaction)
        w3.eth.wait_for_transaction_receipt(approve_hash, timeout=60)

        router_contract = w3.eth.contract(address=Web3.to_checksum_address(router), abi=V2_ABI)
        tx = router_contract.functions.swapExactTokensForTokens(
            amount_in_wei,
            min_out_wei,
            [Web3.to_checksum_address(token_in), Web3.to_checksum_address(token_out)],
            Web3.to_checksum_address(wallet_address),
            deadline,
        ).build_transaction(
            {
                "from": account.address,
                "nonce": w3.eth.get_transaction_count(account.address, "pending"),
                "gas": 200000,
                "maxFeePerGas": w3.eth.gas_price,
                "maxPriorityFeePerGas": w3.eth.max_priority_fee,
                "chainId": chain_id,
            }
        )
        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        if receipt.status == 1:
            return tx_hash.hex()
        return None
    except Exception as e:
        logger.error(f"V2 swap execution error: {e}")
        return None


def execute_arbitrage(
    opp: ArbOpportunity,
    wallet_address: str,
    private_key: str,
    chain: str,
    dry_run: bool = True,
) -> dict:
    """
    Execute a two-leg arbitrage: buy on opp.buy_pool, sell on opp.sell_pool.
    dry_run=True (default) logs the plan without submitting transactions.
    Returns dict with keys: success, tx_buy, tx_sell, actual_profit_usd, error.
    """
    buy = opp.buy_pool
    sell = opp.sell_pool
    eth_price = get_eth_price_usd(chain)
    trade_usd = float(opp.trade_amount_usd)

    token_in = buy.token_in
    token_out = buy.token_out
    dec_in = 18
    dec_out = 6

    # Estimate amount_in in wei from trade_amount_usd / eth_price (approximation for WETH in)
    # More precisely: amount_in = trade_usd / price_of_token_in_in_usd
    # For simplicity: if base_token is USDC (dec=6), amount_out target = trade_usd
    amount_in_usd = Decimal(str(trade_usd))
    amount_in_tokens = amount_in_usd / buy.price  # tokens of token_in
    amount_in_wei = int(amount_in_tokens * Decimal(10**dec_in))
    min_out_wei = int(amount_in_usd * Decimal("1000000") * (Decimal("1") - opp.estimated_slippage_pct))

    if dry_run:
        logger.info(
            f"[DRY RUN] Arb: buy {token_in[:8]}.. on {buy.dex} @ {buy.price:.6f}, "
            f"sell on {sell.dex} @ {sell.price:.6f}, "
            f"gross={float(opp.gross_spread_pct)*100:.3f}%, "
            f"net={float(opp.net_profit_pct)*100:.3f}%, "
            f"gas=${float(opp.estimated_gas_usd):.4f}"
        )
        return {
            "success": True,
            "tx_buy": None,
            "tx_sell": None,
            "actual_profit_usd": float(opp.net_profit_pct) * trade_usd,
            "error": None,
            "dry_run": True,
        }

    logger.info(
        f"Executing arb: buy on {buy.dex}, sell on {sell.dex}, " f"expected net={float(opp.net_profit_pct)*100:.3f}%"
    )

    # --- Leg 1: Buy ---
    tx_buy = None
    if buy.pool_type == "v2" and buy.router:
        tx_buy = _execute_v2_swap(
            token_in=token_in,
            token_out=token_out,
            amount_in_wei=amount_in_wei,
            min_out_wei=min_out_wei,
            router=buy.router,
            wallet_address=wallet_address,
            private_key=private_key,
            chain=chain,
        )
    else:
        logger.warning(f"V3 direct execution not yet implemented; buy leg skipped for {buy.dex}")

    if not tx_buy:
        return {
            "success": False,
            "tx_buy": None,
            "tx_sell": None,
            "actual_profit_usd": 0.0,
            "error": "buy_leg_failed",
        }

    # --- Leg 2: Sell ---
    tx_sell = None
    if sell.pool_type == "v2" and sell.router:
        tx_sell = _execute_v2_swap(
            token_in=token_out,
            token_out=token_in,
            amount_in_wei=min_out_wei,
            min_out_wei=amount_in_wei,
            router=sell.router,
            wallet_address=wallet_address,
            private_key=private_key,
            chain=chain,
        )
    else:
        logger.warning(f"V3 direct execution not yet implemented; sell leg skipped for {sell.dex}")

    success = bool(tx_buy and tx_sell)
    actual_profit = float(opp.net_profit_pct) * trade_usd if success else 0.0

    return {
        "success": success,
        "tx_buy": tx_buy,
        "tx_sell": tx_sell,
        "actual_profit_usd": actual_profit,
        "error": None if success else "sell_leg_failed",
    }
