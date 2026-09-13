#!/usr/bin/env python3
import json
with open('active_positions.json') as f:
    data = json.load(f)
print('Updated at:', data.get('updated_at'))
print('Total positions:', len(data['positions']))
active = [p for p in data['positions'] if p.get('status') == 'active']
closed = [p for p in data['positions'] if p.get('status') == 'closed']
print(f'Active: {len(active)}, Closed: {len(closed)}')
print()
print('Active positions:')
for p in active:
    print(f'  - {p["symbol"]}: balance={p.get("balance", 0)}')