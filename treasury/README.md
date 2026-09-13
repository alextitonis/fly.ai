# SHIT/5H1T — Treasury-Backed Token with Fly Connectome Trader

SHIT (Shitcoin) / 5H1T is a treasury-backed token on Robinhood Chain (chain ID 4663), forked from SHIT Protocol (SHIT Protocol V3, AGPL-3.0). The treasury is traded by 16 real biological connectomes (fruit fly, C. elegans, mouse, etc.) and holds FLYAI as a reserve asset. The entire system runs on Cloudflare Free Tier ($0/month).

Real trading mode: connectomes swap real ETH/tokens via Uniswap V2 Router02. 50% of realized profits auto-buy real FLYAI tokens, which are transferred to the on-chain TreasuryValuation contract. A keeper function auto-pushes the computed RFV/floor price on-chain each epoch.

```
┌─────────────────────────────────────────────────────────────┐
│  Cloudflare Free Tier ($0/month)                             │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Pages       │  │ Workers (TS) │  │ Python Durable Object│  │
│  │ Frontend    │  │ API + Trade  │  │ Fly Brain (165K neu)  │  │
│  │ (AGPL fork)│  │ + Discovery  │  │ imports flycoinrh    │  │
│  │             │  │ + Governance │  │ (MIT, alextitonis)   │  │
│  └─────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ D1 (SQLite) │  │ R2 (10GB)    │  │ Python Worker        │  │
│  │ State       │  │ Connectome   │  │ Enrichment           │  │
│  │ 5GB free    │  │ weights.npz  │  │ imports hermes (MIT) │  │
│  └─────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐                            │
│  │ KV Cache   │  │ Cron Triggers │  Discord Webhook            │
│  │ 100K/day   │  │ 1-2 min       │  (all trade decisions)       │
│  └─────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  Robinhood Chain (4663)                                      │
│                                                               │
│  SHIT token contracts (forked from SHIT Protocol, AGPL)     │
│  TreasuryValuation holds FLYAI as reserve asset               │
│  Floor price = RFV / SHIT supply (enforced on-chain)          │
│                                                               │
│  Trade worker (viem + loxley swap encoding):                  │
│    1. Buy token via Uniswap V2 Router02                       │
│    2. Sell token via Uniswap V2 Router02                      │
│    3. 50% of profit → buy FLYAI on DEX                        │
│    4. Transfer FLYAI to TreasuryValuation contract            │
│    5. Push RFV → refreshValuationsFromKeeper()                │
│    6. SHIT floor price updated on-chain                       │
│    7. enforceRfvInvariant gates minting                       │
└─────────────────────────────────────────────────────────────┘
```

## Components

| Component | CF Service | OSS Used | License | Custom Code |
|---|---|---|---|---|
| Frontend | Pages | SHIT Protocol (fork) | AGPL-3.0 | ~30 lines |
| API Worker | Workers (TS) | — | MIT | ~530 lines |
| Discovery Worker | Workers Cron (TS) | loxley patterns | MIT | ~224 lines |
| Enrichment Worker | Python Worker | hermes-token-screener | MIT | ~209 lines |
| Fly Brain | Python Durable Object | flycoinrh (alextitonis/fly.ai) | MIT | ~776 lines |
| Trade Worker | Workers (TS) | viem + loxley swap encoding | MIT | ~920 lines |
| Contracts | Robinhood Chain | SHIT Protocol (fork) | AGPL-3.0 | ~25 lines (keeper) |
| Migrations | D1 | — | MIT | ~343 lines |
| **Total custom** | | | | **~3,000 lines (1.9%)** |
| **Total OSS** | | | | **~156,000 lines (98.1%)** |

## Prerequisites

- **Node.js** >= 18 (for Wrangler + frontend)
- **pnpm** >= 8 (for frontend): `npm install -g pnpm`
- **Python** >= 3.13 (for Python Workers)
- **uv** (for Python Workers): `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **Foundry** (for Solidity contracts): `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- **Cloudflare account** (free tier is sufficient)
- **Robinhood Chain wallet** with ETH for gas (for real trading)

## Key Addresses (Robinhood Chain, chain ID 4663)

| Name | Address |
|---|---|
| Robinhood Chain RPC | `https://rpc.mainnet.chain.robinhood.com/` |
| Robinhood Chain Explorer | `https://robinhoodchain.blockscout.com` |
| FLYAI Token | `0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C` |
| WETH | `0x0Bd7D308f3E1639FAb988df18A8011f41EAcAD73` |
| UniswapV2Router02 | `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` |
| UniswapV2Factory | `0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f` |
| Universal Router (V4) | `0x8876789976decbfcbbbe364623c63652db8c0904` |
| Pons Factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |

---

## Setup Guide (From Scratch)

### Step 1: Clone the repository

```bash
git clone <your-repo-url> shit-token
cd shit-token
```

### Step 2: Install Cloudflare Wrangler

```bash
npm install -g wrangler
wrangler login  # authenticate with your Cloudflare account
```

### Step 3: Create Cloudflare resources

Create the D1 database, R2 bucket, and KV namespace:

```bash
# D1 database (free: 5GB, 5M reads/day, 100K writes/day)
npx wrangler d1 create shit-token
# Note the database_id from the output

# R2 bucket (free: 10GB) — stores connectome weights
npx wrangler r2 bucket create shit-token-weights

# KV namespace (free: 100K reads/day) — caching
npx wrangler kv namespace create CACHE
# Note the id from the output
```

Update the `database_id` and KV `id` in every `wrangler.toml` file:
- `wrangler.toml` (root)
- `workers/api-worker/wrangler.toml`
- `workers/trade-worker/wrangler.toml`
- `workers/discovery-worker/wrangler.toml`
- `workers/enrichment-worker/wrangler.toml`
- `workers/fly-brain-do/wrangler.toml`
- `workers/governance-worker/wrangler.toml`

### Step 4: Initialize the D1 database

```bash
# Apply schema migrations in order
npx wrangler d1 execute shit-token --file=migrations/schema.sql
npx wrangler d1 execute shit-token --file=migrations/schema_v2.sql
npx wrangler d1 execute shit-token --file=migrations/schema_v3.sql
npx wrangler d1 execute shit-token --file=migrations/schema_v4.sql

# Seed 16 connectomes + 18 wallets
npx wrangler d1 execute shit-token --file=migrations/seed_connectomes.sql
```

### Step 5: Upload connectome weights to R2

The fly brain needs connectome weight files (`.npz`) in R2. These come from the `flycoinrh` package (MIT, alextitonis/fly.ai).

```bash
# Download connectome data (if not already present)
# The weights files should be at flycoinrh/data/*.npz

# Upload each connectome's weights to R2
for cid in celegans celegans_herm celegans_male ciona drosophila hemibrain human larva macaque macaque_modha malecns medulla mouse mouse_retina platynereis rat; do
  if [ -f "flycoinrh/data/${cid}/weights.npz" ]; then
    npx wrangler r2 object put "shit-token-weights/${cid}/weights.npz" --file="flycoinrh/data/${cid}/weights.npz"
    npx wrangler r2 object put "shit-token-weights/${cid}/brain.npz" --file="flycoinrh/data/${cid}/brain.npz"
  fi
done

# The malecns connectome uses root-level paths
npx wrangler r2 object put "shit-token-weights/weights.npz" --file="flycoinrh/data/weights.npz"
npx wrangler r2 object put "shit-token-weights/brain.npz" --file="flycoinrh/data/brain.npz"
```

### Step 6: Deploy Solidity contracts

```bash
cd contracts

# Install Foundry dependencies
forge install

# Copy the env example
cp .env.example .env
# Edit .env:
#   PRIVATE_KEY=0x<your-deployer-private-key>
#   SAFE_MULTISIG_ADDRESS=0x<your-multisig-or-deployer-address>
#   TREASURY_ADDRESS=0x<your-treasury-address>
#   FLYAI_TOKEN_ADDRESS=0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C

# Build
forge build

# Deploy to Robinhood Chain
forge script script/DeployAll.s.sol \
  --rpc-url https://rpc.mainnet.chain.robinhood.com/ \
  --broadcast \
  --private-key $PRIVATE_KEY

# Note the deployed addresses from the output:
#   ShitToken: 0x...
#   TreasuryValuation: 0x...
#   ShitStaking: 0x...
#   etc.
```

After deployment, set the RFV keeper to your executor wallet address:

```bash
# Call setRfvKeeper(executorAddress) on TreasuryValuation via your multisig
# This authorizes the trade worker's executor wallet to auto-push RFV updates
cast send <TREASURY_VALUATION_ADDRESS> "setRfvKeeper(address)" <EXECUTOR_WALLET_ADDRESS> \
  --rpc-url https://rpc.mainnet.chain.robinhood.com/ \
  --private-key $PRIVATE_KEY
```

### Step 7: Set up the trade worker

```bash
cd workers/trade-worker

# Install viem dependency
npm install

# Set secrets (NEVER put private keys in wrangler.toml)
npx wrangler secret put ROBINHOOD_RPC_URL
# Enter: https://rpc.mainnet.chain.robinhood.com/

npx wrangler secret put EXECUTOR_PRIVATE_KEY
# Enter: 0x<your-executor-wallet-private-key>

npx wrangler secret put DISCORD_WEBHOOK_URL
# Enter: https://discord.com/api/webhooks/.../...

# Update wrangler.toml with deployed contract addresses
# SHIT_TOKEN = "<ShitToken address from Step 6>"
# TREASURY_VALUATION = "<TreasuryValuation address from Step 6>"
```

Edit `workers/trade-worker/wrangler.toml` and set:
```toml
[vars]
SHIT_TOKEN = "0x<your-deployed-shit-token-address>"
TREASURY_VALUATION = "0x<your-deployed-treasury-valuation-address>"
REAL_TRADING = "false"  # Set to "true" to enable real trading
```

### Step 8: Set up the API worker

```bash
cd workers/api-worker

# Set the RPC secret for on-chain treasury reads
npx wrangler secret put ROBINHOOD_RPC_URL
# Enter: https://rpc.mainnet.chain.robinhood.com/

# Update wrangler.toml with deployed contract addresses
```

Edit `workers/api-worker/wrangler.toml` and set:
```toml
[vars]
FLYAI_TOKEN = "0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C"
TREASURY_VALUATION = "0x<your-deployed-treasury-valuation-address>"
```

### Step 9: Deploy all workers

```bash
# TypeScript workers
cd workers/api-worker && npx wrangler deploy
cd workers/discovery-worker && npx wrangler deploy
cd workers/trade-worker && npx wrangler deploy
cd workers/governance-worker && npx wrangler deploy

# Python workers (requires uv + pywrangler)
# pywrangler is installed automatically in each worker's .venv via uv
cd workers/enrichment-worker && uv run pywrangler deploy
cd workers/fly-brain-do && uv run pywrangler deploy
```

Note: Python Workers require the `python_workers` compatibility flag. The `workers-py` and `workers-runtime-sdk` dependencies in each worker's `pyproject.toml` provide `pywrangler`, which is a Python wrapper around Wrangler. Run `uv sync` in each Python worker directory first to set up the `.venv`.

### Step 10: Set up the frontend

```bash
cd frontend

# Install dependencies
pnpm install

# Configure environment
cat > .env << 'EOF'
VITE_TESTNET_MODE=false
VITE_WALLETCONNECT_PROJECT_ID=<your-walletconnect-project-id>
VITE_SHIT_UNITS_API_ENDPOINT=https://api-worker.<your-subdomain>.workers.dev
VITE_WALLET_VERIFY_WORKER_URL=https://api-worker.<your-subdomain>.workers.dev
VITE_ETH_FAUCET_WORKER_URL=https://api-worker.<your-subdomain>.workers.dev
EOF

# Build
pnpm build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name shit-token
```

Get a WalletConnect project ID at https://cloud.walletconnect.com (free).

### Step 11: Verify the deployment

```bash
# Check API health
curl https://api-worker.<your-subdomain>.workers.dev/api/health
# Expected: {"status":"ok","time":...}

# Check connectomes
curl https://api-worker.<your-subdomain>.workers.dev/api/connectomes
# Expected: array of 16 connectomes

# Check treasury
curl https://api-worker.<your-subdomain>.workers.dev/api/treasury
# Expected: FLYAI balance, floor price, etc.

# Check on-chain treasury (requires TREASURY_VALUATION to be set)
curl https://api-worker.<your-subdomain>.workers.dev/api/treasury/onchain
# Expected: real FLYAI balance, RFV, floor price from chain

# Trigger trade processing manually
curl https://trade-worker.<your-subdomain>.workers.dev/process
# Expected: {"status":"processing"}
```

### Step 12: Enable real trading (optional, high-risk)

Real trading uses real ETH from the executor wallet. Only enable this if you understand the risks.

```bash
cd workers/trade-worker

# Set REAL_TRADING=true in wrangler.toml
# Edit wrangler.toml: REAL_TRADING = "true"

# Fund the executor wallet with ETH
# Send ETH to the executor wallet address (derived from EXECUTOR_PRIVATE_KEY)

# Deploy the updated worker
npx wrangler deploy

# Monitor the first real trades on Discord and Blockscout
```

### Emergency stop

To immediately halt real trading and fall back to paper mode:

```bash
cd workers/trade-worker
npx wrangler secret put EMERGENCY_STOP
# Enter: 1
npx wrangler deploy
```

---

## How It Works

### Trading loop (every 1 minute via cron)

1. **Fly Brain Durable Object** runs the connectome simulation on 16 biological brains (fruit fly MaleCNS 166K neurons, C. elegans, mouse, etc.) and generates BUY/SELL signals stored in D1
2. **Trade Worker** reads pending signals from D1:
   - Paper mode (`REAL_TRADING=false`): virtual balance, no real money at risk
   - Real mode (`REAL_TRADING=true`): real ETH swaps via Uniswap V2 Router02
3. For each BUY signal: swap ETH → token via Uniswap V2 Router02 (3% slippage cap)
4. For each SELL signal or auto-sell (profit target / stop loss): swap token → ETH
5. If profitable: buy real FLYAI with 50% of profit (WETH → FLYAI via Uniswap V2)
6. Transfer purchased FLYAI to the TreasuryValuation contract
7. Push RFV/floor price on-chain via `refreshValuationsFromKeeper()`
8. Post all decisions to Discord with Blockscout tx links

### RFV / Floor Price mechanism

- **TreasuryValuation** contract holds FLYAI tokens as a reserve asset (50% haircut)
- `computeValuations()` reads `balanceOf(this)` for FLYAI and applies the haircut
- `refreshValuationsFromKeeper()` computes RFV/NAV/floorPrice and stores them on-chain
- `enforceRfvInvariant()` reverts if minting would breach the floor
- The trade worker's executor wallet is authorized as the `rfvKeeper` (set via multisig)
- This creates a circular flywheel: connectomes trade → profits buy FLYAI → FLYAI held in treasury → floor price rises → SHIT token backed by more reserves

### Connectomes (16 biological brains)

| ID | Species | Neurons | Synapses | Source |
|---|---|---|---|---|
| malecns | D. melanogaster | 166,700 | 25.5M | Berg et al. 2025 |
| hemibrain | D. melanogaster | 21,636 | 216K | Scheffer et al. 2020 |
| medulla | D. melanogaster | 40,000 | 400K | Takemura et al. 2013 |
| mouse_retina | M. musculus | 1,124 | 90K | Helmstaedter et al. 2013 |
| larva | D. melanogaster | 3,016 | 30K | Drosophila larva 2023 |
| platynereis | P. dumerilii | 5,000 | 50K | Randel et al. 2014 |
| celegans | C. elegans | 302 | 3K | Varshney et al. 2011 |
| celegans_herm | C. elegans | 453 | 4.9K | Cook et al. 2019 |
| celegans_male | C. elegans | 575 | 5.3K | Cook et al. 2019 |
| drosophila | D. melanogaster | 49 | 1.9K | Chiang et al. 2011 |
| human | H. sapiens | 234 | 7K | Griffa et al. 2019 |
| macaque | M. mulatta | 93 | 1.7K | Markov et al. 2013 |
| macaque_modha | M. mulatta | 242 | 4.1K | Modha & Singh 2010 |
| mouse | M. musculus | 112 | 6.5K | Rubinov et al. 2015 |
| rat | R. norvegicus | 73 | 1.9K | Bota et al. 2015 |
| ciona | C. intestinalis | 205 | 2.9K | Ryan et al. 2016 |

Each connectome has its own wallet with a virtual $10 starting balance. The fly brain runs a LIF (Leaky Integrate-and-Fire) simulation on the real connectome and generates trading signals based on neural activity patterns.

### Self-improvement loop

Every 10 closed trades, the fly brain retrains its reservoir readout (PCA + logistic regression) using the trade outcomes as labels. The connectome itself stays frozen — only the readout and encoder are learned.

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/connectomes` | All 16 connectomes with stats |
| `GET /api/wallets` | All wallets (individual, global, meta) |
| `GET /api/treasury` | Treasury stats (FLYAI balance, floor price) |
| `GET /api/treasury/onchain` | Real on-chain FLYAI balance + RFV + floor from TreasuryValuation |
| `GET /api/positions` | Open positions with unrealized P&L |
| `GET /api/signals` | Recent trading signals |
| `GET /api/trades` | Recent trades |
| `GET /api/flyai` | FLYAI price history |
| `GET /api/tokens` | Discovered tokens |
| `GET /api/performance` | Connectome performance metrics |
| `GET /api/governance` | Wallet governance stats |
| `GET /api/betting/leaderboard` | Betting leaderboard |
| `GET /api/betting/rounds` | Prediction market rounds |
| `POST /api/betting/place-bet` | Place a prediction bet |
| `POST /api/betting/stake` | Stake in profit-sharing vault |
| `POST /api/betting/copy` | Start copy trading |

---

## Development

### Run workers locally

```bash
# TypeScript workers
cd workers/api-worker && npx wrangler dev
cd workers/trade-worker && npx wrangler dev
cd workers/discovery-worker && npx wrangler dev
cd workers/governance-worker && npx wrangler dev

# Python workers
cd workers/enrichment-worker && uv run pywrangler dev
cd workers/fly-brain-do && uv run pywrangler dev
```

### Run frontend locally

```bash
cd frontend
pnpm install
pnpm dev
# Open http://localhost:5173
```

### Build contracts

```bash
cd contracts
forge build
forge test
```

### Run the trade worker manually

```bash
# Process pending signals
curl http://localhost:8787/process

# Force sell all positions (emergency)
curl http://localhost:8787/force-sell-all

# Check paper balance
curl http://localhost:8787/balance

# Check open positions
curl http://localhost:8787/positions
```

---

## Tokenomics

- **SHIT** (Shitcoin) — 100M max supply, SHIT Protocol V3 fork, AGPL-3.0
- **Treasury** holds FLYAI (fly.ai token) as reserve asset
- **50% of trading profits** buy FLYAI → transfer to TreasuryValuation contract
- **RFV** (Risk-Free Value) = FLYAI balance × price × 50% haircut
- **Floor price** = RFV / SHIT supply (enforced on-chain via `enforceRfvInvariant`)
- **Circular flywheel**: connectomes trade → profits buy FLYAI → floor price rises
- **No spending caps** (user choice) — emergency stop is the only protection

## FLYAI Token

| Field | Value |
|---|---|
| Symbol | FLYAI |
| Address | `0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C` |
| Chain | Robinhood Chain (4663) |
| Launchpad | Pons |
| Supply | 1,000,000,000 |
| Website | flyaiworld.com |
| GitHub | github.com/alextitonis/fly.ai |
| Explorer | `https://robinhoodchain.blockscout.com/token/0x0088CE7905025c4B5ea1d49aB6179B6aaADB3B9C` |

FLYAI gives no ownership, governance, revenue share, or claim on the project. Its documented purpose is funding the fly.ai ecosystem.

## OSS Dependencies

| Repo | License | Purpose |
|---|---|---|
| SHIT Protocol (SHIT Protocol V3) | AGPL-3.0 | Contracts + frontend fork |
| alextitonis/fly.ai (flycoinrh) | MIT | Fly brain connectome simulation |
| shmidtqq65/loxley | MIT | Robinhood Chain swap encoding (Uniswap V4) |
| TerexitariusStomp/hermes | MIT | Token screener / enrichment |
| viem | MIT | Ethereum client (wallet, signing, RPC) |
| OpenZeppelin | MIT | Access control, ERC20, SafeERC20 |
| Uniswap V2/V4 | GPL/BUSL | DEX router interfaces |

## License

- Contracts: AGPL-3.0 (SHIT Protocol fork)
- Fly brain: MIT (flycoinrh / alextitonis/fly.ai)
- Enrichment: MIT (hermes-token-screener)
- Trading patterns: MIT (loxley)
- Custom code: MIT

## Security

- Private keys stored as Cloudflare Secrets (never in code or git)
- Real trading requires `REAL_TRADING=true` + `EXECUTOR_PRIVATE_KEY` + `ROBINHOOD_RPC_URL`
- Emergency stop: `EMERGENCY_STOP=1` halts real trading, falls back to paper
- All decisions posted to Discord for auditability (real trades include Blockscout tx links)
- Executor wallet holds both the shared trading fund and FLYAI reserves
- Fly brain cannot sign transactions — only the trade worker signs
- RFV keeper: `refreshValuationsFromKeeper()` allows the executor wallet to auto-push floor price
- Multisig still controls all admin functions (`setRfvKeeper`, `registerAsset`, `refreshValuations`, etc.)
- Swap execution reuses loxley (MIT) Uniswap V4 encoding + viem (MIT) for signing

## Risks

- **Real money at risk**: The executor wallet holds and trades real ETH/tokens. AI connectome trading decisions are experimental. Losses are real and irreversible.
- **No spending caps**: User explicitly chose no caps. Emergency stop is the only protection.
- **Gas costs**: ~$0.02/swap × ~16 trades/min = ~$46/day at full activity.
- **Circular flywheel**: Connectomes can trade FLYAI → profits buy more FLYAI → floor price rises. This is by design but could create artificial price inflation.
- **FLYAI volatility**: FLYAI is a micro-cap token. Large buys could move the price significantly. The 5% slippage cap on FLYAI buys provides some protection.
