#!/usr/bin/env python3
import json

# Load the top100.json file
with open("/home/terexitarius/.hermes/data/token_screener/top100.json", "r") as f:
    data = json.load(f)

tokens = data.get("tokens", [])
print(f"Total tokens: {len(tokens)}")

# Check the first 5 tokens
for i, token in enumerate(tokens[:5]):
    print(f"\nToken {i+1}:")
    print(f"  Symbol: {repr(token.get('symbol'))}")
    print(f"  Dex symbol: {repr(token.get('dex', {}).get('symbol'))}")
    print(f"  Helius symbol: {repr(token.get('helius', {}).get('symbol'))}")
    print(f"  Chain: {token.get('chain')}")
    print(f"  Address: {token.get('contract_address', 'N/A')[:30]}...")
