#!/usr/bin/env python3
import json

with open('/home/terexitarius/.hermes/hermes-token-screener/data/active_positions.json') as f:
    data = json.load(f)

total = len(data['positions'])
active = [p for p in data['positions'] if p.get('balance', 0) > 0]
closed = [p for p in data['positions'] if p.get('status') == 'closed']
synced_recently = [p for p in data['positions'] if p.get('last_synced', 0) > 1777607405]

print(f"Total positions: {total}")
print(f"Active positions (balance > 0): {len(active)}")
print(f"Closed positions (status='closed'): {len(closed)}")
print(f"Positions synced in this run: {len(synced_recently)}")

if active:
    print("\nActive symbols and balances:")
    for p in active:
        print(f"  {p['symbol']}: {p['balance']}")
else:
    print("\nNo active positions with non-zero balance")

# Check if SOL was added as a new position
sol_positions = [p for p in data['positions'] if p['symbol'] == 'SOL']
if sol_positions:
    print(f"\nSOL position(s) found: {len(sol_positions)}")
    for p in sol_positions:
        print(f"  Symbol: SOL, Balance: {p.get('balance')}, Status: {p.get('status')}")
else:
    print("\nNo SOL position found")

print(f"\nFile updated_at: {data.get('updated_at')}")
