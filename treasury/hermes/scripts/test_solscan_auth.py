#!/usr/bin/env python3
"""
Test Solscan API with different authentication methods.
"""

import asyncio
import httpx
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config
import json
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


async def test_solscan_auth_methods():
    """Test different Solscan API authentication methods."""
    print("Testing Solscan API authentication methods...")
    api_key = os.environ.get("SOLSCAN_API_KEY", "")
    if not api_key:
        print("  ❌ Solscan API key not found")
        return

    # Known Solana token (USDC)
    token_address = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

    # Try different authentication methods
    auth_methods = [
        {
            "name": "Bearer Token in Header",
            "headers": {
                "Accept": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            "url": f"https://pro-api.solscan.io/v2.0/token/meta?tokenAddress={token_address}",
        },
        {
            "name": "Token in Header",
            "headers": {"Accept": "application/json", "token": api_key},
            "url": f"https://pro-api.solscan.io/v2.0/token/meta?tokenAddress={token_address}",
        },
        {
            "name": "Token as Query Parameter",
            "headers": {"Accept": "application/json"},
            "url": f"https://pro-api.solscan.io/v2.0/token/meta?tokenAddress={token_address}&token={api_key}",
        },
        {
            "name": "Public API (no auth)",
            "headers": {"Accept": "application/json"},
            "url": f"https://public-api.solscan.io/token/meta?tokenAddress={token_address}",
        },
    ]

    async with httpx.AsyncClient() as client:
        for method in auth_methods:
            try:
                print(f"\n  Testing: {method['name']}")
                print(f"    URL: {method['url'][:80]}...")

                resp = await client.get(
                    method["url"],
                    headers=method["headers"],
                    timeout=10.0,
                )

                if resp.status_code == 200:
                    data = resp.json()
                    print(f"    ✅ Success - Response: {json.dumps(data, indent=2)[:200]}...")
                    return True
                else:
                    print(f"    ❌ Error: {resp.status_code} - {resp.text[:100]}")
            except Exception as e:
                print(f"    ❌ Exception: {e}")

    return False


if __name__ == "__main__":
    result = asyncio.run(test_solscan_auth_methods())
    if result:
        print("\n✅ Found working authentication method!")
    else:
        print("\n❌ All authentication methods failed.")
