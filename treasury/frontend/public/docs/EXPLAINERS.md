# Technical explainers

These are for the specific questions the SHIT Protocol audience is actually searching for.

---

## 1. How an SHIT Protocol V3 fork with real-asset backing differs from a pure treasury-gaming fork

### What an SHIT Protocol V3 fork actually does

SHIT Protocol V3 (the SHIT v3 rewrite) turns a treasury into a set of on-chain policies managed by a `Kernel`. The treasury is not a single wallet; it is a set of modules (`SHIT ProtocolTreasury`, `SHIT ProtocolMinter`, `SHIT ProtocolRange`, `SHIT ProtocolHeart`, etc.) that share state through a central `Kernel`. Each module is installed, activated, and can be replaced by governance.

A treasury-gaming fork copies the *shape* (reserve currency, high APY staking, bonds) but treats the treasury as a marketing black box. The protocol says it is backed, but the assets are illiquid, unaudited, or not actually on-chain.

### What real-asset backing changes

Real-asset backing means the tokens in the `SHIT ProtocolTreasury` balance actually exist, are priced by on-chain oracles, and are subject to a conservative haircut. The SHIT Protocol fork adds four differences:

1. **Asset registry and haircuts.** `TreasuryValuation` registers every accepted token with a `haircutBps`. A 0% haircut applies to stables like USDC. A 50% haircut applies to impact tokens and POL. This means RFV is a worst-case liquidation value, not a nominal mark.
2. **On-chain price discovery.** `ImpactOracleAdapter` prices impact tokens from Uniswap V3 TWAPs. `StablecoinPriceFeed` fixes stables at $1. `shitPrice` uses a Uniswap V3 TWAP for the SHIT reserve pair. No spreadsheet prices.
3. **Permissionless onboarding with timelock.** `TokenOnboardingManager` lets anyone propose an impact token, but it sits for a 2-day timelock and must clear `TokenRegistry` before it can enter the treasury as collateral.
4. **Revenue from real cash flows.** The treasury is not just a vault. POL positions earn trading fees. PSM minting of Bucky against impact collateral produces seigniorage and AMO yield. Lending AMOs earn from overcollateralized debt.

### The practical difference

In a gaming fork, the treasury value is whatever the front-end claims. In this design, the RFV and NAV can be recomputed from on-chain balances by anyone calling `TreasuryValuation.refreshValuations()` or `shitTreasuryPolicy.refreshValuations()`. The floor price is the value the treasury could actually realize if it had to wind down tomorrow.

---

## 2. How a MakerDAO DSS fork works as a climate RWA stablecoin

### DSS in one paragraph

MakerDAO's DSS (Decentralized Stablecoin System) is a multi-collateral stablecoin engine. It has a `Vat` (ledger), `Spotter` (collateral price feed), `Dog` (liquidation), `Vow` (surplus/deficit accounting), and `GemJoin`/`DaiJoin` adapters. Users lock collateral, draw a stablecoin, and can be liquidated if the position falls below the liquidation ratio.

### Applying DSS to climate RWA

In SHIT Protocol, the stablecoin is **Bucky**. The collateral can be:

- USDC/sUSDS (stables, 0% haircut in the treasury)
- Impact tokens (SLR, TGN, REGEN, DOVU, KVCM, CEN)
- SHIT and stSHIT protocol-owned positions

The `shitCollateralManager` is the DSS `ilk` manager. For each collateral type it stores:

- a price feed from `ImpactOracleAdapter`
- a liquidation ratio
- a debt ceiling (line)
- whether the asset is a stablecoin

### The climate-specific parts

1. **RWA collateral is not wrapped in a trust.** The collateral is an ERC-20 impact token that already claims a real-world outcome. The protocol does not verify the outcome itself; it treats the token as a volatile collateral with a 50% haircut.
2. **Conservative liquidation.** `LinearDecrease` auction abacus lets the protocol liquidate impact positions without flash-crashing the token. The 150%+ liquidation ratio and 50% treasury haircut mean Bucky is overcollateralized by more than the mark-to-market price.
3. **Stablecoin loops back into climate finance.** Bucky minted against impact collateral can be deployed by the Lending AMO and Uniswap V4 AMO, earning yield that is partially directed to stakers and partially to the protocol.

### Why this is not a normal RWA token

The protocol is not buying carbon credits and hoping they appreciate. It is allowing climate tokens to be used as productive collateral for a stablecoin, while applying on-chain price discovery and haircuts. The real-world claim is an input; the engineering output is a stablecoin whose backing can be audited block-by-block.

---

## 3. How inverse bonds burn supply and what that does to the economics

### What an inverse bond is

A normal bond lets a user deposit reserve assets (USDC, impact tokens) and receive discounted, vested SHIT. An **inverse bond** does the opposite: the protocol buys SHIT from the open market and burns it. It is a NAV-discount buyback.

In the SHIT Protocol implementation:

- `shitInverseBond` lets users sell SHIT to the treasury.
- The sale price is `NAV per SHIT minus a 1.5% spread`.
- The SHIT received by the contract are burned.
- Capacity is `1% of liquid treasury value` per 8-hour epoch.

### Why it reduces supply

When a user sells 100 SHIT through the inverse bond, those 100 SHIT leave circulation forever. Total supply drops. If the treasury has more backing per remaining SHIT, the floor price and NAV per SHIT mechanically rise, all else equal.

### Economic effect

1. **Supply sink.** Inverse bonds convert liquid reserves into fewer SHIT. The treasury gains nothing and loses reserves, but the remaining SHIT become more backed.
2. **Floor price support.** Because `ShitStaking` uses the floor price to gate rebases and supplemental emissions, a higher floor makes the staking contract more conservative.
3. **Counter-cyclical use.** Inverse bonds are not meant to run constantly. They are meant for periods when SHIT trades below NAV and the treasury wants to shrink supply.

### Guardrails

- `updateNav(navPershit, liquidTreasuryValue)` sets the per-epoch capacity.
- The 1.5% spread prevents instantaneous arbitrage that drains reserves.
- The 1% cap per epoch prevents a single block from burning a large share of supply.
- The inverse bond is also wired into the `shitCircuitBreaker` logic: if Bucky depegs, the circuit breaker trips before heavy inverse bond activity can destabilize reserves.

---

## 4. How SHIT Protocol models the economics of a treasury-backed RWA token

### The core accounting identity

SHIT Protocol is built around the invariant:

```
RFV <= NAV
floor price = RFV / SHIT supply
NAV per SHIT = NAV / SHIT supply
```

- **RFV (Risk-Free Value):** what the treasury could be liquidated for in a worst case.
- **NAV (Net Asset Value):** the full mark-to-market value of all assets.
- **Floor price:** the value below which the protocol will not mint new SHIT.

### Inputs to the model

The model takes the following on-chain inputs:

| Input | Source |
|---|---|
| Treasury balances | `SHIT ProtocolTreasury` ERC-20 holdings |
| Stablecoin prices | `StablecoinPriceFeed` (fixed $1) |
| Impact token prices | `ImpactOracleAdapter` V3 TWAPs |
| SHIT market price | `shitPrice` Uniswap V3 TWAP |
| Haircuts | `TreasuryValuation` per-asset `haircutBps` |

### Outputs

`TreasuryValuation` emits or exposes:

- `rfv` — haircut-adjusted backing
- `nav` — full market value
- `floorPrice` — `rfv / totalSupply`
- `navPershit` — `nav / totalSupply`

`ShitStaking` uses `floorPrice` to decide whether a rebase can distribute new SHIT. If the market price is below floor, the protocol does not inflate supply into a discount.

### The RWA part

The "real-world asset" is the impact token. The protocol does not hold a legal claim on a solar farm or a forest. Instead, it holds the token that the project issues to represent its claim. The token is subject to:

- 50% treasury haircut
- on-chain TWAP pricing
- liquidation through the DSS module

This means the model is not a prediction of the RWA's future value. It is a liquidation model. The floor price assumes the impact token can only be sold for half of its market price.

### Assumptions the model depends on

1. **The impact token has a liquid Uniswap V3 pool.** Without liquidity, the TWAP is manipulable.
2. **The 50% haircut is conservative.** For high-beta climate tokens, 50% may not be enough in a crisis. Governance can raise it.
3. **The stablecoin reserves are stable.** USDC is assumed to hold $1. If it depegs, `shitCircuitBreaker` must trip.
4. **The treasury does not mint SHIT below floor.** The `SHIT ProtocolMinter` and `ShitStaking` contracts enforce this.

---

## 5. Inverse bonds as a supply sink: mechanics and guardrails

### Bond pricer and capacity

`shitBondPricer` computes a recommended discount for normal bonds. `shitInverseBond` does not use the pricer directly; it uses a fixed spread. The important mechanics are:

- **Bond price:** `navPershit * (1 - 150 bps)`
- **Capacity:** `liquidTreasuryValue * 1%` per 8-hour epoch
- **Burn:** every SHIT received is sent to the burn address

### Why a 1.5% spread?

The spread protects the treasury from frontrunning the NAV update. `TreasuryValuation` and `shitPrice` update on the Heart beat. A 1.5% spread means the seller only captures NAV minus a buffer, so the treasury does not lose reserves to arbitrage between the price update and the bond sale.

### Epoch capacity and circuit breaker

The `shitDefenseBudget` (or the inverse bond's own `liquidTreasuryValue`) caps how much can be spent. The `shitCircuitBreaker` monitors:

- Bucky peg
- treasury NAV vs supply
- impact oracle staleness

If any metric is out of bounds, the circuit breaker can pause inverse bond sales before reserves are drained.

### What the supply sink does not do

Inverse bonds do **not** increase the backing per SHIT if the treasury pays out more reserves than the market value of the burned SHIT. They only increase backing if the sale happens below NAV and the spread is not larger than the discount. The 1.5% spread is a guardrail that makes this a slow, deliberate mechanism, not a rapid buyback.

---

## 6. Building a MakerDAO DSS fork for climate RWA collateral

### Why reuse DSS

MakerDAO's DSS is one of the most battle-tested multi-collateral stablecoin systems. It already solves:

- vault accounting (`Vat`)
- price oracles (`Spotter`)
- liquidation auctions (`Dog`, `LinearDecrease`)
- surplus/deficit handling (`Vow`)
- adapter-based token onboarding

For a climate RWA stablecoin, the hard part is not the stablecoin engine. It is the collateral policy.

### The collateral policy in SHIT Protocol

The `shitCollateralManager` maps each climate token to a DSS `ilk`:

```
ilk = {
  token: 0x...,
  priceFeed: ImpactOracleAdapter,
  liquidationRatio: 1.5e27,  // 150%
  debtCeiling: 1_000_000e18, // in Bucky
  isStablecoin: false
}
```

Each `ilk` uses `ImpactOracleAdapter.getTokenPrice(token)` as the `Spotter` price. The `Dog` can liquidate a vault if `collateral value * liquidationRatio < debt`.

### Engineering decisions

1. **No off-chain identity.** The protocol does not KYC the borrower. Anyone with the climate token can open a vault.
2. **High liquidation ratio.** Climate tokens are volatile, so the minimum collateralization is 150% and the treasury haircut is 50%.
3. **TWAP oracle.** `ImpactOracleAdapter` uses a Uniswap V3 TWAP, not an instantaneous price. This prevents flash-loan liquidation attacks.
4. **AMO loops.** The `shitLendingAMO` and `shitUniswapV4AMO` put minted Bucky to work. The goal is not to keep Bucky idle; it is to earn yield that flows to stakers and the treasury.

### What is hard about this

- **Impact token liquidity.** A 150% collateralization ratio means nothing if there is no liquid market to sell the collateral in a crisis.
- **Oracle liveness.** If the Uniswap V3 pool has low volume, the TWAP can be stale or manipulated.
- **Real-world correlation.** Climate tokens may all crash together during a climate-policy shock or a crypto drawdown. A 50% haircut may not survive a correlated selloff.

### Why build it anyway

The alternative is that climate tokens sit in wallets and produce no yield. By making them productive collateral for an overcollateralized stablecoin, the protocol creates demand for the token, a price floor from liquidation, and a source of Bucky that can be deployed into climate-finance pools.

---

## 7. On-chain achievements that are shareable

The protocol already records the following facts:

- First 100 stakers (testnet `ShitStaking` events)
- Top referrers (`ReferralRegistry`)
- Whitelist signers (`/api/whitelist/join` backed by on-chain signatures)
- First bond participants (`shitBonding` deposits)
- Top impact-token clarity scores (`impact-leaderboard` data)

These are not marketing claims. They are block-by-block records. When the mainnet migration happens, these testnet records can be used for allocation weighting, status, and airdrop eligibility.
