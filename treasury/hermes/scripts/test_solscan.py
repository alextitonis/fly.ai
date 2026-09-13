#!/usr/bin/env python3
"""
Test Solscan API with different endpoints.
"""

import asyncio
import httpx
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config
import os
from pathlib import Path

import httpx

# Load environment variables
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                key, value = line.split("=", 1)
                os.environ[key] = value


async def test_solscan_endpoints():
    """Test different Solscan API endpoints."""
    print("Testing Solscan API endpoints...")
    api_key = os.environ.get("SOLSCAN_API_KEY", "")
    if not api_key:
        print("  ❌ Solscan API key not found")
        return

    # Known Solana token (USDC)
    token_address = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

    # Try different endpoints
    endpoints = [
        f"https://public-api.solscan.io/token/meta?tokenAddress={token_address}",
        f"https://public-api.solscan.io/token/holders?tokenAddress={token_address}&limit=10",
        f"https://public-api.solscan.io/token/transfer?tokenAddress={token_address}&limit=10",
    ]

    headers = {"Accept": "application/json", "Authorization": f"Bearer {api_key}"}

    async with httpx.AsyncClient() as client:
        for i, endpoint in enumerate(endpoints, 1):
            try:
                print(f"\n  Testing endpoint {i}: {endpoint}")
                resp = await client.get(endpoint, headers=headers, timeout=10.0)

                if resp.status_code == 200:
                    data = resp.json()
                    print(f"    ✅ Success - Response type: {type(data)}")
                    if isinstance(data, dict):
                        print(f"    Keys: {list(data.keys())[:5]}")
                    elif isinstance(data, list):
                        print(f"    List length: {len(data)}")
                else:
                    print(f"    ❌ Error: {resp.status_code} - {resp.text[:100]}")
            except Exception as e:
                print(f"    ❌ Exception: {e}")


if __name__ == "__main__":
    asyncio.run(test_solscan_endpoints())
