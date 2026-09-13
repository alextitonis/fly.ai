# Treasury — what's actually in it right now

The live source of truth for the SHIT Protocol treasury is the frontend page at `/#/treasury`. That page reads balances, valuations, and prices directly from the on-chain contracts. It is the only place that should show current numbers. This document explains how to interpret what you see there.

## How to verify the treasury yourself

1. Open `/#/treasury` in the deployed app.
2. The page loads the treasury contract, the policy contract, and token addresses from `frontend/lib/contracts.ts` and `frontend/lib/tokens.ts`, not from a static list. This means the displayed addresses stay correct when deployments move.
3. Click any asset address to open the treasury's balance on the block explorer for the current network.
4. Cross-check the `TreasuryMetricsWidget` numbers against `TreasuryValuation` and `SHIT_TREASURY_POLICY` directly on the explorer.
5. If the connected network is mainnet but the treasury has not been deployed there, the page will say so and will not display stale testnet numbers.

## What the treasury can hold

These are the asset classes the protocol is built to hold. The live page shows which of them are actually in the treasury right now.

| Asset | Type | Haircut | How it's verified | Yield source |
|---|---|---|---|---|
| SHIT | Protocol | 0% | ERC-20 balance | n/a while in treasury |
| stSHIT | Protocol | 0% | ERC-20 balance at ShitStaking | Rebasing share of treasury revenue |
| wstSHIT | Protocol | 0% | ERC-20 balance | Accrues to the wrapped share price |
| Bucky | Stablecoin | 0% | DSS Vat/Spotter/ilk + overcollateralization | Lending AMO + Uniswap V4 AMO |
| RIDX | Protocol | 0% | ERC-20 balance | Index component yield when configured |
| USDC | Reserve | 0% | StablecoinPriceFeed (fixed $1) + ERC-20 balance | Aave/Sky savings yield |
| sUSDS | Reserve | 0% | ERC-20 balance | Sky sUSDS savings rate |

## Impact tokens the protocol can accept

These are the first whitelisted impact-asset classes. They only count toward RFV after passing the `TokenOnboardingManager` pipeline and being registered in `TokenRegistry`. The live page lists the accepted addresses and current balances; this doc describes the rule.

| Symbol | Name | Source | Haircut | Verification |
|---|---|---|---|---|
| SLR | Solarcoin | PSM collateral or standard bond deposit | 50% | TokenRegistry + ImpactOracleAdapter V3 TWAP |
| TGN | Treegens | PSM collateral or standard bond deposit | 50% | TokenRegistry + ImpactOracleAdapter V3 TWAP |
| REGEN | Regen | PSM collateral or standard bond deposit | 50% | TokenRegistry + ImpactOracleAdapter V3 TWAP |
| DOVU | DOVU | PSM collateral or standard bond deposit | 50% | TokenRegistry + ImpactOracleAdapter V3 TWAP |
| KVCM | Klima Protocol | PSM collateral or standard bond deposit | 50% | TokenRegistry + ImpactOracleAdapter V3 TWAP |
| CEN | Crypto Endowment Network | PSM collateral or standard bond deposit | 50% | TokenRegistry + ImpactOracleAdapter V3 TWAP |

## Verification pipeline

An asset does not count as treasury backing until it has passed all of these checks:

1. **TokenRegistry** — only governance-whitelisted contract addresses can be recognized.
2. **TokenOnboardingManager** — new impact tokens sit in a 2-day timelock before they can be added.
3. **ImpactOracleAdapter** — each token is priced from a Uniswap V3 TWAP.
4. **TreasuryValuation** — applies a conservative haircut (0% stable, 2% Morpho, 50% impact, 50% POL).
5. **Safe multisig** — every privileged update (new collateral, new valuation, large withdrawal) requires multisig.

## Why the live page is the only status you should trust

Treasury balances change every block, and deployment addresses can move between networks. Static documentation cannot stay current. The `/#/treasury` page reads the contracts directly, shows the connected network, and is honest about empty, small, or testnet treasuries. If you see a number here that is older than the latest block, trust the live page instead.
