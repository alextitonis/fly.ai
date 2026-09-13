"""JSON-RPC provider with failover across multiple endpoints."""
import json
import os
import ssl
import time
import urllib.request
from typing import Any, Optional

from .config import Config

# Import tor_config to enable TOR patching
from hermes_screener import tor_config  # noqa: F401

class RpcProvider:
    """Failover JSON-RPC provider with TOR support."""
    
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self._rpc_indices: dict[str, int] = {}
        self.ssl_ctx = ssl.create_default_context()
        self.ssl_ctx.check_hostname = False
        self.ssl_ctx.verify_mode = ssl.CERT_NONE

    def _get_rpcs(self, chain: str) -> list[str]:
        urls = self.config.rpc_urls.get(chain, [])
        if not urls:
            raise ValueError(f"No RPC URLs configured for chain '{chain}'")
        return urls

    def call(self, chain: str, method: str, params: list = None) -> dict:
        """Make a JSON-RPC call with failover across endpoints."""
        if params is None:
            params = []
        rpcs = self._get_rpcs(chain)
        idx = self._rpc_indices.get(chain, 0)
        last_exc = None

        for _ in range(len(rpcs) * self.config.max_retries_per_call):
            url = rpcs[idx % len(rpcs)]
            try:
                payload = json.dumps({
                    "jsonrpc": "2.0",
                    "method": method,
                    "params": params,
                    "id": 1
                }).encode()

                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "Hermes-Arbitrage/1.0",
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=15, context=self.ssl_ctx) as resp:
                    result = json.loads(resp.read().decode())
                    self._rpc_indices[chain] = idx  # remember successful endpoint
                    return result
            except Exception as e:
                last_exc = e
                idx += 1
                time.sleep(self.config.retry_delay_seconds)

        # All attempts failed
        self._rpc_indices[chain] = idx
        return {"error": f"rpc_failed after {len(rpcs)} endpoints", "detail": str(last_exc)}

    def eth_call(self, chain: str, to: str, data: str) -> Optional[str]:
        """Perform eth_call and return the hex result, or None on failure."""
        resp = self.call(chain, "eth_call", [{"to": to, "data": data}, "latest"])
        result = resp.get("result", "")
        if not result or result == "0x":
            return None
        return result

    def get_latest_block_number(self, chain: str) -> Optional[int]:
        """Get the latest block number."""
        resp = self.call(chain, "eth_blockNumber", [])
        result = resp.get("result")
        if result:
            return int(result, 16)
        return None

    def get_gas_price(self, chain: str) -> Optional[dict]:
        """Get current gas price estimate (returns dict with baseFeePerGas, etc)."""
        resp = self.call(chain, "eth_gasPrice", [])
        if "result" in resp:
            return {"gasPrice": int(resp["result"], 16)}
        return None

    def estimate_gas(self, chain: str, to: str, data: str, value: int = 0) -> Optional[int]:
        """Estimate gas for a transaction."""
        resp = self.call(chain, "eth_estimateGas", [{
            "to": to,
            "data": data,
            "value": hex(value)
        }])
        if "result" in resp:
            return int(resp["result"], 16) if resp["result"].startswith("0x") else int(resp["result"])
        return None
