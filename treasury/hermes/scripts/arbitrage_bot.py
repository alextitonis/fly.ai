#!/usr/bin/env python3
"""
DEX Arbitrage Bot: continuous scanner that finds and optionally executes cross-DEX arbitrage.

Usage:
  python arbitrage_bot.py --chain base --token 0xTOKEN --base-token 0xUSDC \\
      --amount-usd 1000 --dry-run --interval 30
"""

import argparse
import fcntl
import logging
import os
import sys
import time

# Allow running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from hermes_screener.trading.arbitrage_executor import execute_arbitrage, get_eth_price_usd
from hermes_screener.trading.arbitrage_scanner import scan_arbitrage

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("arbitrage_bot")

# Default tokens (Base chain WETH/USDC)
DEFAULT_TOKEN = "0x4200000000000000000000000000000000000006"
DEFAULT_BASE_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
LOCK_FILE = "/tmp/arbitrage_bot.lock"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="DEX Arbitrage Bot")
    p.add_argument("--chain", default="base", help="Chain name (default: base)")
    p.add_argument("--token", default=DEFAULT_TOKEN, help="Token address to scan")
    p.add_argument("--base-token", default=DEFAULT_BASE_TOKEN, dest="base_token", help="Quote token (e.g. USDC)")
    p.add_argument("--amount-usd", type=float, default=1000.0, dest="amount_usd", help="Trade size in USD")
    p.add_argument(
        "--min-profit-pct", type=float, default=0.002, dest="min_profit_pct", help="Min net profit (default 0.2%%)"
    )
    p.add_argument("--dry-run", action="store_true", default=True, dest="dry_run", help="Simulate only (default: True)")
    p.add_argument("--live", action="store_true", default=False, help="Enable live execution (overrides --dry-run)")
    p.add_argument("--interval", type=int, default=30, help="Scan interval in seconds (default: 30)")
    p.add_argument("--gas-gwei", type=float, default=1.0, dest="gas_gwei", help="Gas price in Gwei (default: 1.0)")
    p.add_argument("--wallet", default="", help="Wallet address (required for live mode)")
    p.add_argument("--key", default="", help="Private key (required for live mode)")
    p.add_argument(
        "--tokens-file", default="", dest="tokens_file", help="JSON file with list of token addresses to scan"
    )
    return p.parse_args()


def acquire_lock() -> int:
    """Single-instance guard. Returns fd or raises SystemExit."""
    fd = open(LOCK_FILE, "w")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fd.write(str(os.getpid()))
        fd.flush()
        return fd
    except BlockingIOError:
        logger.error("Another instance of arbitrage_bot is already running. Exiting.")
        sys.exit(1)


def log_opportunity(opp, idx: int) -> None:
    profitable_tag = "PROFITABLE" if opp.is_profitable else "unprofitable"
    logger.info(
        f"  [{idx+1}] {profitable_tag} | "
        f"buy={opp.buy_pool.dex}({opp.buy_pool.pool_type}) @ {float(opp.buy_pool.price):.6f} | "
        f"sell={opp.sell_pool.dex}({opp.sell_pool.pool_type}) @ {float(opp.sell_pool.price):.6f} | "
        f"gross={float(opp.gross_spread_pct)*100:.3f}% "
        f"slip={float(opp.estimated_slippage_pct)*100:.3f}% "
        f"gas=${float(opp.estimated_gas_usd):.4f} "
        f"net={float(opp.net_profit_pct)*100:.3f}%"
    )


def run_scan_cycle(
    tokens: list,
    base_token: str,
    chain: str,
    amount_usd: float,
    gas_gwei: float,
    eth_price: float,
    min_profit_pct: float,
    dry_run: bool,
    wallet: str,
    private_key: str,
    stats: dict,
) -> None:
    stats["total_scans"] += 1
    logger.info(f"--- Scan #{stats['total_scans']} | {len(tokens)} token(s) | ETH=${eth_price:.0f} ---")

    for token in tokens:
        logger.info(f"Scanning {token[:10]}... vs {base_token[:10]}... on {chain}")
        try:
            all_opps = scan_arbitrage(
                token_address=token,
                base_token=base_token,
                chain=chain,
                trade_amount_usd=amount_usd,
                gas_price_gwei=gas_gwei,
                eth_price_usd=eth_price,
                min_profit_pct=min_profit_pct,
            )
        except Exception as e:
            logger.error(f"scan_arbitrage failed for {token}: {e}")
            continue

        profitable = [o for o in all_opps if o.is_profitable]
        logger.info(f"Found {len(all_opps)} opportunities ({len(profitable)} profitable)")
        stats["opportunities_found"] += len(profitable)

        for i, opp in enumerate(all_opps[:10]):  # log top 10
            log_opportunity(opp, i)

        if not dry_run and profitable:
            if not wallet or not private_key:
                logger.warning("Live mode requires --wallet and --key; skipping execution")
                continue

            best = profitable[0]
            logger.info(f"Executing best opportunity: net={float(best.net_profit_pct)*100:.3f}%")
            try:
                result = execute_arbitrage(
                    opp=best,
                    wallet_address=wallet,
                    private_key=private_key,
                    chain=chain,
                    dry_run=False,
                )
                if result["success"]:
                    profit = result.get("actual_profit_usd", 0.0)
                    stats["trades_executed"] += 1
                    stats["total_profit_usd"] += profit
                    logger.info(
                        f"Trade SUCCESS: profit=${profit:.4f} | buy={result['tx_buy']} sell={result['tx_sell']}"
                    )
                else:
                    logger.error(f"Trade FAILED: {result.get('error')}")
            except Exception as e:
                logger.error(f"execute_arbitrage error: {e}")


def main() -> None:
    args = parse_args()
    lock_fd = acquire_lock()

    dry_run = not args.live  # --live overrides --dry-run default

    if args.live:
        logger.warning("LIVE EXECUTION MODE ENABLED")
        if not args.wallet or not args.key:
            logger.error("--wallet and --key required for live mode")
            sys.exit(1)
    else:
        logger.info("Dry-run mode (use --live to enable execution)")

    # Load token list
    tokens: list = [args.token]
    if args.tokens_file and os.path.isfile(args.tokens_file):
        import json

        with open(args.tokens_file) as f:
            extra = json.load(f)
        if isinstance(extra, list):
            tokens = extra
            logger.info(f"Loaded {len(tokens)} tokens from {args.tokens_file}")

    stats = {
        "total_scans": 0,
        "opportunities_found": 0,
        "trades_executed": 0,
        "total_profit_usd": 0.0,
    }

    logger.info(
        f"Starting arbitrage bot | chain={args.chain} | interval={args.interval}s | "
        f"amount=${args.amount_usd} | min_profit={args.min_profit_pct*100:.2f}%"
    )

    try:
        while True:
            eth_price = get_eth_price_usd(args.chain)

            run_scan_cycle(
                tokens=tokens,
                base_token=args.base_token,
                chain=args.chain,
                amount_usd=args.amount_usd,
                gas_gwei=args.gas_gwei,
                eth_price=eth_price,
                min_profit_pct=args.min_profit_pct,
                dry_run=dry_run,
                wallet=args.wallet,
                private_key=args.key,
                stats=stats,
            )

            logger.info(
                f"Stats: scans={stats['total_scans']} opps={stats['opportunities_found']} "
                f"trades={stats['trades_executed']} profit=${stats['total_profit_usd']:.4f}"
            )
            logger.info(f"Sleeping {args.interval}s...")
            time.sleep(args.interval)

    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    finally:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            lock_fd.close()
            os.unlink(LOCK_FILE)
        except Exception:
            pass
        logger.info(
            f"Final stats: scans={stats['total_scans']} opps={stats['opportunities_found']} "
            f"trades={stats['trades_executed']} profit=${stats['total_profit_usd']:.4f}"
        )


if __name__ == "__main__":
    main()
