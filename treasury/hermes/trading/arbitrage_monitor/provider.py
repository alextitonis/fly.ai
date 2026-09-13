
"""Provider Abstraction Layer for Arbitrage Monitor

Provides RPC access to EVM chains (HTTP + optional TOR routing).
Reuses tor_config patching pattern from existing codebase.
"""

import os
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class ChainProvider:
    """Wraps a web3.HTTPProvider with chain-specific RPC URL rotation."""

    def __init__(self, chain: str, rpc_url: Optional[str] = None):
        self.chain = chain
        self.rpc_url = rpc_url or self._default_rpc(chain)
        self._w3 = None
        self._init_web3()

    def _default_rpc(self, chain: str) -> str:
        """Standard fallback RPC URLs per chain."""
        defaults = {
            "ethereum": "https://eth.llamarpc.com",
            "base":     "https://base.llamarpc.com",
            "arbitrum": "https://arbitrum.llamarpc.com",
            "polygon":  "https://polygon.llamarpc.com",
        }
        return defaults.get(chain, f"https://{chain}.rpc.thirdweb.com")

    def _init_web3(self):
        """Initialize Web3, applying tor_config SSL patch if needed."""
        try:
            from web3 import Web3
            # Tor patching — import hermes_tor_config ensures env variables are read
            try:
                from hermes_tor_config import TOR_URL, should_route_tor
                # TOR_URL env var automatically patches httpx requests if present
                logger.debug("[Provider] TOR support loaded  (TOR_URL=%s)", os.getenv("TOR_URL","unset"))
            except ImportError:
                pass  # tor not configured, okay
            self._w3 = Web3(Web3.HTTPProvider(self.rpc_url, request_kwargs={"timeout": 15}))
        except Exception as e:
            logger.error("[Provider] Failed to connect to %s: %s", self.rpc_url, e)
            raise

    @property
    def w3(self):
        return self._w3

    async def gas_price(self) -> int:
        """Return current gas price in wei."""
        return self._w3.eth.gas_price

    async def estimate_gas(self, to: str, data: bytes) -> int:
        """Estimate gas for a raw calldata call."""
        try:
            return self._w3.eth.estimate_gas({"to": to, "data": data})
        except Exception:
            return 250000  # safe fallback

    async def call_contract(self, contract: str, data: bytes) -> Optional[bytes]:
        """eth_call to a contract and return raw output bytes."""
        try:
            return self._w3.eth.call({"to": contract, "data": data})
        except Exception as e:
            logger.debug("[Provider] eth_call failed %s: %s", contract[:10], e)
            return None

def create_provider(chain: str, rpc_url: Optional[str] = None) -> ChainProvider:
    """Factory for chain-scoped RPC provider."""
    return ChainProvider(chain=chain, rpc_url=rpc_url)
