#!/usr/bin/env python3
"""
Test API integrations for Solscan, Helius, and Birdeye.
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


async def test_solscan():
    """Test Solscan API."""
    print("Testing Solscan API...")
    api_key = os.environ.get("SOLSCAN_API_KEY", "")
    if not api_key:
        print("  ❌ Solscan API key not found")
        return False

    try:
        async with httpx.AsyncClient() as client:
            # Test with a known Solana token (USDC)
            resp = await client.get(
                "https://public-api.solscan.io/token/meta?tokenAddress=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                headers={"Accept": "application/json", "token": api_key},
                timeout=10.0,
            )

            if resp.status_code == 200:
                data = resp.json()
                print(f"  ✅ Solscan API working - Token: {data.get('name', 'Unknown')}")
                return True
            else:
                print(f"  ❌ Solscan API error: {resp.status_code}")
                return False
    except Exception as e:
        print(f"  ❌ Solscan API exception: {e}")
        return False


async def test_helius():
    """Test Helius API."""
    print("Testing Helius API...")
    api_key = os.environ.get("HELIUS_API_KEY", "")
    if not api_key:
        print("  ❌ Helius API key not found")
        return False

    try:
        async with httpx.AsyncClient() as client:
            # Test with a known Solana token (USDC)
            resp = await client.post(
                f"https://mainnet.helius-rpc.com/?api-key={api_key}",
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getAsset",
                    "params": {
                        "id": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                        "displayOptions": {"showFungibleTokens": True},
                    },
                },
                timeout=10.0,
            )

            if resp.status_code == 200:
                data = resp.json()
                result = data.get("result", {})
                name = result.get("content", {}).get("metadata", {}).get("name", "Unknown")
                print(f"  ✅ Helius API working - Token: {name}")
                return True
            else:
                print(f"  ❌ Helius API error: {resp.status_code}")
                return False
    except Exception as e:
        print(f"  ❌ Helius API exception: {e}")
        return False


async def test_birdeye():
    """Test Birdeye API."""
    print("Testing Birdeye API...")
    api_key = os.environ.get("BIRDEYE_API_KEY", "")
    if not api_key:
        print("  ❌ Birdeye API key not found")
        return False

    try:
        async with httpx.AsyncClient() as client:
            # Test with a known Solana token (USDC)
            resp = await client.get(
                "https://public-api.birdeye.so/defi/token_overview?address=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&chain=solana",
                headers={"X-API-KEY": api_key, "accept": "application/json"},
                timeout=10.0,
            )

            if resp.status_code == 200:
                data = resp.json()
                token_data = data.get("data", {})
                name = token_data.get("name", "Unknown")
                print(f"  ✅ Birdeye API working - Token: {name}")
                return True
            else:
                print(f"  ❌ Birdeye API error: {resp.status_code}")
                return False
    except Exception as e:
        print(f"  ❌ Birdeye API exception: {e}")
        return False


async def main():
    """Run all tests."""
    print("=" * 80)
    print("API Integration Tests")
    print("=" * 80)

    results = []
    results.append(await test_solscan())
    results.append(await test_helius())
    results.append(await test_birdeye())

    print("\n" + "=" * 80)
    print("Summary:")
    print(f"  Solscan: {'✅ PASS' if results[0] else '❌ FAIL'}")
    print(f"  Helius:  {'✅ PASS' if results[1] else '❌ FAIL'}")
    print(f"  Birdeye: {'✅ PASS' if results[2] else '❌ FAIL'}")

    if all(results):
        print("\n🎉 All API integrations are working!")
    else:
        print("\n⚠️  Some API integrations failed. Check your API keys and network connectivity.")

    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
