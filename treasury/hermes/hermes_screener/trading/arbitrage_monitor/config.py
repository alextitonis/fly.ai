"""Configuration for real-time arbitrage monitoring."""
import os
from dataclasses import dataclass, field
from typing import List

@dataclass
class Config:
    """Settings loaded from environment variables or defaults."""
    
    # Chain endpoints
    chains: List[str] = field(default_factory=lambda: ["base"])
    
    # Provider URLs (HTTP)
    rpc_urls: dict = field(default_factory=lambda: {
        "base": [
            "https://base.llamarpc.com",
            "https://base.drpc.org",
            "https://1rpc.io/base",
        ],
        "ethereum": [
            "https://eth.llamarpc.com",
            "https://rpc.ankr.com/eth",
        ],
        "arbitrum": [
            "https://arb1.arbitrum.io/rpc",
            "https://rpc.ankr.com/arbitrum",
        ],
    })
    
    # WebSocket URLs (optional). If empty, newHeads subscription not available.
    ws_urls: dict = field(default_factory=lambda: {})

    # Mempool monitoring: enable via WebSocket pending tx subscription
    enable_mempool: bool = False
    
    # Known DEX router addresses for mempool filtering (per chain)
    dex_router_addresses: dict = field(default_factory=lambda: {
        "base": [
            "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",  # Uniswap V2 Router
            "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",  # Aerodrome Router
            "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",  # BaseSwap Router
            "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891",  # SushiSwap Router
        ],
    })

    # Data path for merged DEX listings
    merged_data_path: str = os.path.expanduser("~/.hermes/data/all_chains_dex_merged.json")
    
    # Minimum liquidity and volume thresholds
    min_liquidity_usd: float = 1000.0
    min_volume_24h_usd: float = 100.0

    # Minimum profit threshold (net, after fees & gas) in basis points
    # e.g., 0.002 = 0.2% = 20 bps
    min_profit_pct: float = 0.002  

    # Gas price strategy: "avg" = use average; "eip1559" = use base+tip
    gas_price_strategy: str = "eip1559"
    
    # Override gas price in gwei (if set, overrides strategy)
    gas_price_gwei_override: float | None = None

    # How often to scan (seconds) if not using real-time events
    poll_interval_seconds: int = 15

    # Maximum number of pools to scan per run (0 = no limit)
    max_pools_per_scan: int = 0

    # Telegram alert configuration
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_chat_id: str = os.getenv("TELEGRAM_CHAT_ID", "")
    
    # TOR usage (inherit from environment)
    use_tor: bool = os.getenv("HERMES_TOR_ENABLED", "true").lower() in ("true", "1", "yes")

    # Provider failover attempts
    max_retries_per_call: int = 3
    retry_delay_seconds: float = 0.5
