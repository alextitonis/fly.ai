#!/usr/bin/env python3
import os, requests, json

solana_wallet = os.environ.get('WALLET_ADDRESS_SOLANA', '')
rpc_url = os.environ.get('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com')

print(f'Wallet: {solana_wallet}')
print(f'RPC: {rpc_url}')

payload = {
    'jsonrpc': '2.0',
    'id': 1,
    'method': 'getBalance',
    'params': [solana_wallet],
}

try:
    r = requests.post(rpc_url, json=payload, timeout=15)
    print(f'Response status: {r.status_code}')
    data = r.json()
    print(f'Data: {json.dumps(data)[:500]}')
    if 'result' in data:
        lamports = data.get('result', {}).get('value', 0)
        sol_balance = lamports / 1e9
        print(f'SOL Balance: {sol_balance}')
except Exception as e:
    print(f'Error: {e}')