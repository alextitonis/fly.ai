# DeFi Trading System

Multi-chain DeFi trading system with **4,114 protocols** across **288 verified chains**.

## Architecture

```
dex_aggregator_trader.py     Orchestrator (contract first, API fallback)
contract_executor.py         EVM direct on-chain execution (ABI + router)
solana_adapter.py            Solana program execution (Jupiter/Raydium)
protocol_registry.py         Router addresses + minimal ABIs
defi_protocol_registry.py    4,114 protocols sorted by blockchain
working_protocols.json       89 tested & confirmed protocols
```

## Supported Chains (9 EVM + Solana)

| Chain | DEX Contracts | Lending | Bridges | API Protocols |
|-------|--------------|---------|---------|---------------|
| Ethereum | 8 | 6 | 2 | 10 |
| Base | 17 | 5 | 4 | 10 |
| Arbitrum | 2 | 3 | 0 | 10 |
| Optimism | 1 | 0 | 0 | 10 |
| BSC | 2 | 1 | 0 | 10 |
| Avalanche | 2 | 0 | 0 | 10 |
| Gnosis | 2 | 0 | 0 | 10 |
| Celo | 1 | 0 | 0 | 10 |
| Solana | 0 | 0 | 0 | 2 (Jupiter, Raydium) |

## Integration Tiers

**Tier 1 — Full On-Chain** (no API needed):
- Uniswap V2/V3, PancakeSwap V2/V3, SushiSwap V2/V3, Curve, Balancer

**Tier 2 — API Route + Contract Execution** (API builds calldata, we simulate+sign+send):
- 1inch, ParaSwap, Odos, KyberSwap, 0x

**Tier 3 — API-Only** (off-chain signing or no verified ABI):
- CoW Protocol, OpenOcean, LiFi, THORChain

## Key Methods

```python
# Best quote on a specific chain
best_dex, best_out = executor.best_quote_across_chains("base", weth, usdc, 10**16)

# Quotes across all chains
all_quotes = executor.quote_all_chains("WETH", "USDC", 10**18)

# Direct swap with simulation
tx_hash = executor.smart_swap(native, token, amount, slippage_bps=100)

# Solana swap via Jupiter
sig = solana_adapter.swap(sol_mint, usdc_mint, amount, slippage_bps=50)
```

## Protocol Registry

`defi_protocol_registry.py` contains 4,114 protocols sorted by blockchain:
- Each entry: name, slug, category, TVL, chains, contracts, integration method
- Lookup: `dpr.ALL_PROTOCOLS["Aave V3"]` → `{slug, category, tvl, chains}`
- Chain lists: `dpr.ETHEREUM`, `dpr.BASE`, `dpr.SOLANA`, etc.

## Data Sources

- **DeFiLlama**: Protocol TVL, categories, chains, addresses
- **Etherscan**: Contract ABIs (API key: `3VY4WXTCKJWC3PQHDTK38MVR73AMPV5A4S`)
- **Protocol APIs**: KyberSwap, Odos, ParaSwap, CoW, Jupiter, Raydium

## Files

| File | Size | Description |
|------|------|-------------|
| `defi_protocol_registry.py` | 2.0MB | 4,114 protocols by chain |
| `defillama_full_registry.json` | 1.7MB | Raw DeFiLlama data |
| `working_protocols.json` | 82KB | Tested protocols |
| `contract_executor.py` | 37KB | EVM execution engine |
| `solana_adapter.py` | 20KB | Solana execution engine |
| `dex_aggregator_trader.py` | 71KB | Main orchestrator |
| `protocol_registry.py` | 15KB | Router addresses + ABIs |
| `abi_cache.json` | 112KB | ParaSwap/1inch ABIs |
| `removed_chains.md` | 19KB | Removed chains log |
