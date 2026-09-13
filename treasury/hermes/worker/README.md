# Hermes Remote Worker

Offloads all internet-dependent operations from the local hermes daemon
to a free cloud VPS (Oracle Cloud Free Tier, Render, Fly.io, Railway).

## Endpoints

| Method | Path   | Purpose                                  |
|--------|--------|------------------------------------------|
| POST   | /enrich  | Token enrichment pipeline (Dexscreener, RugCheck, Etherscan, GoPlus, Zerion, De.Fi, GMGN social, Whale refresh, holder distribution) |
| POST   | /proxy   | Generic HTTP proxy for API calls        |
| GET    | /health  | Health check                             |
| GET    | /        | Service info                             |

## Environment

| Variable         | Description                                   |
|------------------|-----------------------------------------------|
| `PORT`           | Server port (default: 10000)                  |
| `GMGN_API_KEY`   | GMGN API key (optional)                       |
| `ETHERSCAN_API_KEY` | Etherscan API key (optional)               |
| `RUGCHECK_SHIELD_KEY` | RugCheck shield key (optional)            |

**Note:** CoinGecko API key removed — price data comes exclusively from Dexscreener.

## Layers (default)

1. dexscreener — token pairs, price, liquidity, volume, price change
2. goplus — EVM security (honeypot, taxes, mintability)
3. rugcheck — Solana risk score & holder count
4. etherscan — contract verification status
5. defi — De.Fi token risk assessment
6. zerion — token balances + account metadata
7. whale — top-50 wallet enrichment
8. holders — top-20 holders distribution
9. refresh — force refresh already-known tokens
10. gmgn_social — GMGN social/age/risk data

Each layer can be enabled/disabled individually in the `layers` field of the
`/enrich` request body.