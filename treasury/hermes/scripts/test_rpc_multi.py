#!/usr/bin/env python3
"""Test multiple RPC endpoints for wallet balance."""
import os, requests, json, sys

wallets = [
    ("HaDbEJKwmPkh54PCMjvirtBfde4175WCBDEjyA1u6h6F", "mainnet"),
]

rpcs = [
    "https://api.mainnet-beta.solana.com",
    "https://solana-mainnet.g.alchemy.com/v2/demo",  # Demo endpoint - won't work but let's see
    "https://rpc.ankr.com/solana",
]

for wallet, net in wallets:
    print(f"\n=== Wallet: {wallet} ({net}) ===")
    for rpc in rpcs:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": [wallet],
        }
        try:
            r = requests.post(rpc, json=payload, timeout=10)
            data = r.json()
            val = data.get("result", {}).get("value", "N/A")
            print(f"  {rpc[:40]}: lamports={val}")
        except Exception as e:
            print(f"  {rpc[:40]}: ERROR - {str(e)[:50]}")