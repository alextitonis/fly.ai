"""Hermes DeFi Platform - Token screening, smart money tracking, and multi-chain trading execution."""

# Apply TOR SOCKS5 proxy globally - routes ALL external HTTP through TOR
from hermes_screener import tor_config  # noqa: F401

__version__ = "10.0.0"
__all__ = ["config", "logging", "metrics", "trading", "agents", "memory", "models"]
