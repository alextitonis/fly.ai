#!/usr/bin/env python3
"""
Test Solscan free tier endpoints.
"""

import asyncio

import httpx
# TOR proxy - route all external HTTP through SOCKS5
import sys, os
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-token-screener"))
import hermes_screener.tor_config


async def test_solscan_free_tier():
    """Test Solscan free tier endpoints."""
    print("Testing Solscan free tier endpoints...")

    # Known Solana token (USDC)
    token_address = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

    # Try different free tier endpoints
    endpoints = [
        # Token endpoints
        f"https://public-api.solscan.io/token/meta?tokenAddress={token_address}",
        f"https://public-api.solscan.io/token/holders?tokenAddress={token_address}&limit=10",
        f"https://public-api.solscan.io/token/transfer?tokenAddress={token_address}&limit=10",
        f"https://public-api.solscan.io/token/list?tokenAddress={token_address}",
        # Account endpoints
        f"https://public-api.solscan.io/account/tokens?account={token_address}",
        f"https://public-api.solscan.io/account/transactions?account={token_address}&limit=10",
        # Market endpoints
        f"https://public-api.solscan.io/market/token?tokenAddress={token_address}",
        # Search endpoints
        f"https://public-api.solscan.io/search?keyword={token_address}",
    ]

    headers = {"Accept": "application/json"}

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
                    return True
                else:
                    print(f"    ❌ Error: {resp.status_code} - {resp.text[:100]}")
            except Exception as e:
                print(f"    ❌ Exception: {e}")

    return False


if __name__ == "__main__":
    result = asyncio.run(test_solscan_free_tier())
    if result:
        print("\n✅ Found working free tier endpoint!")
    else:
        print("\n❌ No working free tier endpoints found.")
