
"""Entry-point script for Cross-DEX Arbitrage Monitor.

Usage:
    python run_arbitrage_monitor.py    # uses ARBITRAGE_* env vars
    or
    systemctl start hermes-arbitrage   # via provided service unit

Environment variables:
    ARBITRAGE_CHAINS            comma-separated chains to monitor (default: base,ethereum)
    ARBITRAGE_PAIRS             comma-separated pairs like WETH/USDC,USDC/WETH
    ARBITRAGE_MIN_PROFIT_ETH    minimum net profit threshold (default: 0.015)
    ARBITRAGE_POLL_INTERVAL     seconds between scans (default: 30)
    ARBITRAGE_QUOTE_AMOUNT_ETH  amount to quote per scan (default: 1.0)
    ARBITRAGE_TELEGRAM_BOT_TOKEN  Telegram bot token (optional)
    ARBITRAGE_TELEGRAM_CHAT_ID    Telegram chat ID (optional)
"""

import asyncio
import logging
import os
import sys

# Add parent package to path so relative imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from arbitrage_monitor.arbitrage_daemon import CrossDexArbitrageDaemon
from arbitrage_monitor.config import load_config, CONFIG

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)

def main():
    cfg = load_config()
    logger = logging.getLogger(__name__)
    logger.info("[Arb] Launch — chains=%s pairs=%d min_profit=%.4f ETH poll=%ds",
                ",".join(cfg.chains), len(cfg.pairs), cfg.min_profit_eth, cfg.poll_interval)

    daemon = CrossDexArbitrageDaemon()
    try:
        asyncio.run(daemon.start())
    except KeyboardInterrupt:
        logger.info("[Arb] Stopped by user.")
    except Exception as e:
        logger.error("[Arb] Fatal: %s", e, exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
