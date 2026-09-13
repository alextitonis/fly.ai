# AGENTS.md — SHIT Token

## Project Overview

SHIT (Shitcoin) is a treasury-backed token on Robinhood Chain (4663), forked from SHIT Protocol (SHIT Protocol V3, AGPL-3.0). The treasury is traded by a real fruit fly connectome (165K neurons) and holds FLYAI as a reserve asset. The entire system runs on Cloudflare Free Tier ($0/month).

## Directory Structure

```
shit-token/
├── contracts/              # Foundry Solidity (AGPL-3.0, forked from SHIT Protocol)
│   ├── src/Shit*.sol       # Renamed from shit*.sol
│   ├── script/DeployAll.s.sol  # FLYAI registration added
│   └── foundry.toml
├── workers/                # Cloudflare Workers (all free tier)
│   ├── fly-brain-do/       # Python Durable Object (imports flycoinrh)
│   ├── discovery-worker/   # TS Cron (polls launchpads)
│   ├── trade-worker/       # TS (viem + Discord webhook)
│   ├── api-worker/         # TS (API endpoints)
│   └── enrichment-worker/  # Python Worker (imports hermes)
├── migrations/schema.sql   # D1 schema
├── frontend/               # Forked from SHIT Protocol (AGPL-3.0)
│   └── lib/chains.ts       # Updated for Robinhood Chain (4663)
├── flycoinrh/              # Fly brain (MIT, alextitonis/fly.ai)
├── loxley/                  # Trading patterns (MIT, shmidtqq65/loxley)
├── hermes/                  # Token screener (MIT, TerexitariusStomp)
├── wrangler.toml            # Root CF config
└── README.md
```

## Build & Test

### Contracts
```bash
cd contracts
forge build
forge test
```

### Workers
```bash
# TS Workers
cd workers/api-worker && npx wrangler dev
cd workers/discovery-worker && npx wrangler dev
cd workers/trade-worker && npx wrangler dev

# Python Workers
cd workers/enrichment-worker && uv run pywrangler dev
cd workers/fly-brain-do && uv run pywrangler dev
```

### Frontend
```bash
cd frontend
pnpm install
pnpm dev
pnpm build
```

## Key Addresses

| Name | Address |
|---|---|
| Robinhood Chain | Chain ID 4663 |
| Robinhood Testnet | Chain ID 46630 |
| FLYAI Token | `0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C` |
| FLYAI/ NVDA Pair | `0x04f9f653f1692bbffeda87a5436aded3e9c0bc65e0bd929747a3a64b67c1312e` |
| WETH | `0x0Bd7D308f3E1639FAb988df18A8011f41EAcAD73` |
| RPC | `https://rpc.mainnet.chain.robinhood.com/` |
| Explorer | `https://robinhoodchain.blockscout.com` |

## Custom Code (<5%)

| File | Lines | Purpose |
|---|---|---|
| workers/fly-brain-do/src/worker.py | ~20 | Thin wrapper: import flycoinrh, call step() |
| workers/enrichment-worker/src/worker.py | ~30 | Thin wrapper: import hermes, call score() |
| workers/discovery-worker/src/index.ts | ~50 | Cron: poll Pons + DexScreener |
| workers/trade-worker/src/index.ts | ~880 | Paper + real trading (viem + loxley swap encoding) |
| workers/trade-worker/src/loxley-swap.ts | ~240 | OSS copy from loxley (MIT) — pure swap functions |
| workers/api-worker/src/index.ts | ~530 | API endpoints + on-chain treasury |
| migrations/schema.sql | ~115 | D1 schema |
| migrations/schema_v4.sql | ~20 | Real trading columns (tx_hash, is_real, flyai_buy_tx) |
| wrangler.toml | ~20 | CF config |
| FLYAI registration | ~18 | Treasury contract config |
| TreasuryValuation keeper | ~25 | setRfvKeeper() + refreshValuationsFromKeeper() |
| frontend/lib/chains.ts | ~5 | Chain ID |
| **Total custom** | **~1,960** | **~3.3% of ~58K OSS** |

## Security

- Private keys stored as CF Secrets (never in code)
- Real trading mode requires `REAL_TRADING=true` secret + `EXECUTOR_PRIVATE_KEY` + `ROBINHOOD_RPC_URL`
- Emergency stop: set `EMERGENCY_STOP=1` secret to halt real trading and fall back to paper mode
- Cooldown between trades (COOLDOWN_SECONDS)
- Safety checks before every buy (honeypot, tax, liquidity)
- All decisions posted to Discord for auditability (real trades include Blockscout tx links)
- Executor wallet holds both the shared trading fund and FLYAI reserves
- Fly brain cannot sign transactions directly — only the trade worker signs
- RFV keeper: `refreshValuationsFromKeeper()` on TreasuryValuation allows the executor wallet to auto-push floor price
- Multisig still controls all admin functions (setRfvKeeper, registerAsset, refreshValuations, etc.)
- Swap execution reuses loxley (MIT) Uniswap V4 encoding + viem (MIT) for signing
