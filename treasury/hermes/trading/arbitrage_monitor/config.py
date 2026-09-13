
"""Configuration loader for the arbitrage monitor.

Reads environment variables (ARBITRAGE_*). Intended to be imported
by both standalone CLI and systemd service.
"""

import os
from dataclasses import dataclass
from typing import List

@dataclass(frozen=True)
class ArbitrageConfig:
    chains:          List[str]
    min_profit_eth:  float
    poll_interval:   int
    quote_amount_eth: float
    telegram_bot_token: Optional[str]
    telegram_chat_id:   Optional[str]
    pairs: List[Tuple[str, str]]  # (token_in, token_out) per chain

def load_config() -> ArbitrageConfig:
    chains_str = os.getenv("ARBITRAGE_CHAINS", "base,ethereum,arbitrum")
    chains = [c.strip() for c in chains_str.split(",") if c.strip()]

    pairs_env = os.getenv("ARBITRAGE_PAIRS", "")
    pairs = []
    if pairs_env:
        for pair in pairs_env.split(","):
            if "/" in pair:
                a, b = pair.strip().split("/", 1)
                pairs.append((a, b))

        if not pairs:
            # Default fallback pairs — WETH/USDC (both directions)
            pairs = [
                ("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  # WETH
                 "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),  # USDC
                ("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                 "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
            ]
    else:
        # No pairs config will be read from top100.json dynamically
        pairs = []

    return ArbitrageConfig(
        chains           = chains,
        min_profit_eth   = float(os.getenv("ARBITRAGE_MIN_PROFIT_ETH", "0.015")),
        poll_interval    = int(os.getenv("ARBITRAGE_POLL_INTERVAL", "30")),
        quote_amount_eth = float(os.getenv("ARBITRAGE_QUOTE_AMOUNT_ETH", "1.0")),
        telegram_bot_token = os.getenv("ARBITRAGE_TELEGRAM_BOT_TOKEN"),
        telegram_chat_id   = os.getenv("ARBITRAGE_TELEGRAM_CHAT_ID"),
        pairs             = pairs,
    )

CONFIG = load_config()
