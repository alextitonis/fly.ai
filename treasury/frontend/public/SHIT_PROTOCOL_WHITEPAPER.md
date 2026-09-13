# SHIT Protocol

### A Decentralized Financial System for Real-World Environmental Assets

**Whitepaper — v2.0**

---

## Abstract

Regenerative finance and decentralized finance have grown up separately. These assets sit largely outside the liquidity, composability, and yield infrastructure that DeFi has spent a decade building — while DeFi, for all its sophistication, has struggled to find real-world collateral that means something beyond speculation.

SHIT Protocol closes that gap. It is a full-stack DeFi protocol on Base blockchain, using the ethereum virtual machine, that treats impact tokens as first-class financial collateral — not a side pool, but the backing for a treasury-secured governance token (**SHIT**), a multi-collateral overcollateralized stablecoin (**Bucky**), and an integrated suite of staking, bonding, lending, trading, and yield products. 

This paper explains what SHIT Protocol is, why it's built the way it is, and how each component reinforces the others to create a self-sustaining financial ecosystem for environmental capital.

---

## Table of Contents

1. [The Problem](#1.-the-problem)  
2. [The SHIT Protocol Solution](#2.-the-shit-finance-solution)  
3. [Protocol Architecture](#3.-protocol-architecture)  
4. [The SHIT Token](#4.-the-shit-token)  
5. [Staking](#5.-staking)  
6. [Bonding](#6.-bonding)  
7. [Trading Infrastructure](#7.-trading-infrastructure)  
8. [Bucky — The Stablecoin](#8-bucky--the-stablecoin)  
9. [Treasury & Protocol-Owned Liquidity](#9-treasury--protocol-owned-liquidity)  
10. [Vaults & Meta-Vaults](#10-vaults--meta-vaults)  
11. [Governance](#heading=h.f9rzz5y2dtdd)  
12. [Advanced Financial Primitives](#11.-advanced-financial-primitives)  
13. [Supporting Infrastructure](#13.-supporting-infrastructure)  
14. [Security](#14.-security)  
15. [System Dynamics — The Flywheels](#15-system-dynamics--the-flywheels)  
16. [Risk Disclosures](#16.-risk-disclosures)  
17. [Conclusion](#17.-conclusion)  
18. [Glossary](#18.-glossary)  
19. [The SHIT Protocol Roadmap](#19-the-shit-finance-roadmap)

---

## 1\. The Problem

Trillions of dollars in environmental value — carbon offsets, biodiversity credits, renewable energy certificates — are locked out of efficient capital markets. The reasons are structural:

- **Illiquidity.** Most environmental credits trade over-the-counter, through brokers, on timelines measured in weeks.  
- **No composability.** A carbon credit can't be used as loan collateral, deposited into a yield vault, or paired against a stablecoin the way a blue-chip crypto asset can.  
- **No price discovery.** Without deep markets, it's hard to know what an impact asset is actually worth at any given moment.  
- **No financial infrastructure.** Traditional finance wasn't built for tokenized, fractional, programmable assets — and most of DeFi wasn't built with environmental assets in mind.

Meanwhile, DeFi has spent years perfecting the primitives — AMMs, lending markets, staking, derivatives — but the assets underpinning most protocols are either purely speculative or synthetic dollars with no connection to the physical world.

SHIT Protocol exists to put these two worlds together: real environmental assets, and the full machinery of decentralized finance.

---

## 2\. The SHIT Protocol Solution

SHIT Protocol is an integrated financial system, not a single product. At its center sits a treasury of real assets — stablecoins, environmental impact tokens, and protocol-owned liquidity — that supports everything built on top of it:

- **SHIT** — a supply-capped token with a treasury supported floor  
- **stSHIT / wstSHIT** — staking receipts that earn protocol revenue automatically  
- **Bucky** — an overcollateralized stablecoin minted against approved impact assets  
- **Bonds** — a market-based mechanism for the treasury to acquire assets and manage supply  
- **Vaults & meta-vaults** — automated yield infrastructure for stakers and liquidity providers  
- **Lending, perpetuals, yield trading, and index products** — financial tools built on top of the core system  
- **On-chain governance** — full community control, secured by a timelock

No single piece of SHIT Protocol is meant to work in isolation. The treasury backs the token; the token secures staking; staking rewards drive protocol-owned liquidity; liquidity deepens markets for Bucky and impact assets; and governance sits above all of it, letting the community steer the system as conditions change. Section 15 walks through exactly how these pieces reinforce one another.

---

## 3\. Protocol Architecture

SHIT Protocol is built on the **SHIT Protocol V3 Kernel & Policy** pattern — a proven architecture for composable, upgradeable DeFi protocols.

- **The Kernel** is the central module registry. Core state — the treasury, the token, staking — lives in **modules** registered with the Kernel.  
- **Policies** are the contracts that actually implement protocol logic. Each policy declares exactly which module functions it needs via `configureDependencies()` and `requestPermissions()`, and the Kernel enforces those permissions at the protocol level.

This separation means logic can be upgraded — a policy replaced, a parameter changed — without touching the underlying state modules, and every permission a policy holds is explicit and auditable on-chain. The three foundational policies are:

| Policy | Responsibility |
| :---- | :---- |
| `ShitTreasuryPolicy.sol` | RFV/NAV tracking, idle-asset deployment to Morpho, RFV invariant enforcement, idle caps |
| `ShitPOLPolicy.sol` | Protocol-owned liquidity across Uniswap V4, Curve, and Balancer |
| `ShitStakingPolicy.sol` | Staking module configuration |

---

## 4\. The SHIT Token

SHIT is an ERC-20 token and the economic core of the protocol, governed by two hard rules that no proposal, manager, or market condition can override.

### A Fixed Supply

SHIT has a hard cap of **100,000,000 tokens**, enforced in the smart contract. No governance vote, no emergency action, no upgrade path can mint beyond it.

### The RFV Invariant

This is the single most important rule in the system: **the protocol can never mint more SHIT than the treasury's Risk-Free Value (RFV) can back at the floor price.** Every mint call runs through `enforceRfvInvariant()`, and any mint that would break the backing ratio is rejected outright — not flagged, not queued for review, simply reverted.

### The Floor Hook

Because the treasury backs a defined floor price, SHIT carries a price safety net enforced directly at the trading-pool level: the **floor hook** intercepts trades on the protocol's own pools and prevents SHIT from being sold below its treasury-backed floor. Every mint or burn triggers `updateTotalSupply()`, which recalculates the floor in real time.

### Distribution Discipline

- **Team vesting** runs over 30 days, managed off-chain via Hedgey Finance — no team tokens unlock in a lump sum.  
- **The fee decay splitter** mirrors that same 30-day window: management's share of trading fees decays from 80% at launch to 0% over 30 days, while the treasury's share rises from 20% to 100%.  
- **V1 migration** — legacy token holders migrate to SHIT via a Merkle-proof claim, verifiable on-chain without exposing every other holder's allocation.

---

## 5\. Staking

Staking is how SHIT holders earn a share of protocol revenue, expressed through a rebasing receipt token.

When SHIT is staked, holders receive **stSHIT**, whose balance grows automatically — no claiming, no compounding required. Rewards are distributed every **8-hour epoch**, capped at a maximum rebase of **0.45% per epoch** as a hard-coded inflation guard. The rebase function is fully permissionless: anyone can trigger it, and every holder's balance updates simultaneously.

Rewards are sourced from four independent revenue streams:

1. **POL trading fees** — revenue from the protocol's own liquidity  
2. **Gauge emissions** — rewards earned by staking LP tokens  
3. **Vote market bribes** — payments for directing SHIT' governance weight  
4. **Supplemental emissions** — additional SHIT minted only when the token trades at a premium

For integrations that don't handle rebasing balances well, **wstSHIT** wraps stSHIT into a fixed-balance token whose exchange rate rises over time instead — the same pattern used by Lido's wstETH.

---

## 6\. Bonding

Bonding lets the treasury acquire assets and manage supply through market-priced mechanisms, rather than one-off sales.

**Standard bonds**, run through Bond Protocol, let users deposit USDC and receive SHIT at a discount to market price, vested gradually rather than delivered all at once.

**Inverse bonds** run the mechanism in reverse: users sell SHIT back to the protocol near NAV, and every token received is **permanently burned** — reducing supply and increasing the backing behind everything that remains. Purchases are capped at 1% of liquid treasury value per 8-hour epoch, preventing the treasury from over-committing capital too quickly.

**The premium seller** is the system's pressure-release valve. When SHIT trades above **2× NAV**, a keeper-triggered contract mints and sells SHIT in small clips — 0.25% of pool reserves, at least an hour apart — pulling the price back toward fair value while routing the proceeds directly into the treasury.

Together, these three mechanisms mean SHIT supply expands and contracts in response to market conditions, always anchored to what the treasury actually holds.

---

## 7\. Trading Infrastructure

SHIT Protocol trades on **Uniswap V4**, using its native **hooks** architecture to enforce protocol rules at the point of every trade.

The **floor hook** enforces the price floor directly inside the trading pool — no trade can execute below it. The **fee splitter** routes trading fees between the treasury and stakers at a governance-adjustable ratio, with the **fee decay splitter** variant handling the 30-day management-to-treasury transition described in Section 4\. Pool deployment runs through `ShitMarketFactory`, which clones new V4 pools with floor hooks and fee splitters pre-attached.

Rather than building and maintaining custom hooks for every feature, SHIT Protocol deliberately integrates with battle-tested external infrastructure: dynamic fees via **Aegis**, LP auto-rebalancing and loyalty rewards via **Steer**, and volume incentive programs run off-chain. This keeps the protocol's own attack surface small while still delivering full-featured markets.

---

## 8\. Bucky — The Stablecoin

Bucky is SHIT Protocol's USD-pegged, multi-collateral, **overcollateralized** stablecoin — and it's where the protocol's environmental thesis becomes directly usable as money.

### Minting Against Impact Assets

Bucky is minted through the **Peg Stability Module (PSM)** by depositing approved impact tokens — assets such as Solarcoin, Treegens, DOVU, KVCM, Regen, and CEN — as collateral, always at a ratio above 100% (e.g. 150%, set by governance per asset). Each collateral type carries its own governance-approved oracle, collateralization ratio, and fee schedule, all priced through on-chain TWAP feeds via the `ImpactOracleAdapter` — no off-chain price dependencies.

### Defending the Peg

The **PegKeeper** is an automated, keeper-triggered system that monitors Bucky's Curve pool and buys or sells Bucky to correct any drift from $1, with a 15-minute cooldown between actions to avoid overreacting to noise. Profits from peg defense flow back to the treasury.

### Putting Collateral to Work

Two **AMOs (Algorithmic Market Operations)** deploy Bucky productively without compromising the peg: a **Lending AMO** that supplies Bucky to Morpho markets, and a **Uniswap V4 AMO** that provides Bucky liquidity through protocol-controlled hooks.

### Security-Critical Components in Vyper

The core peg-defense contracts — `PegKeeperOptimized.vy`, the Curve-style `StableSwap.vy` pool, and the `ERC20Pegged.vy` token itself — are written in **Vyper** rather than Solidity, prioritizing simplicity and auditability where it matters most.

---

## 9\. Treasury & Protocol-Owned Liquidity

The treasury is what makes every other guarantee in this document possible.

### Two Ways to Measure Value

The protocol tracks two valuations simultaneously:

- **RFV (Risk-Free Value)** — a conservative valuation with haircuts applied by asset risk: 0% on USDC, 2% on Morpho deposits, 50% on impact tokens, and 50% on protocol-owned liquidity (accounting for the double slippage risk of unwinding a pool position).  
- **NAV (Net Asset Value)** — the full market value of treasury holdings, with no discounting.

RFV governs minting safety; NAV prices inverse bonds. The gap between them is the protocol's built-in margin of safety.

### Idle Capital Limits

Treasury capital is required to work: idle USDC is capped at 30%, idle impact tokens at 10%, and idle protocol-owned liquidity at 0% — every unit of POL must be actively deployed.

### Owning, Not Renting, Liquidity

Rather than paying token incentives to rent liquidity from mercenary LPs — capital that can vanish overnight — SHIT Protocol owns its liquidity outright across **Uniswap V4, Curve, and Balancer**. Gauge adapters (`BaseGaugeAdapter`, `CurveGaugeAdapter`, `BalancerGaugeAdapter`) capture additional emissions on top of trading fees, and the **YieldRouter** collects revenue from every pool in a single `harvestAll()` call. Because the protocol owns this liquidity permanently, trading fees flow to stakers indefinitely rather than leaking out to short-term liquidity mercenaries.

Treasury valuations can be updated three ways — manually by a manager, automatically from oracle data, or automatically from actual on-chain balances — with the balance-based method offering the most trustless path to an accurate treasury snapshot. Reserve withdrawals and new debt require a governance vote; there is no unilateral path to draining the treasury.

### Initial Asset Acquisition Plan

The treasury's first assets are the reserves that make the RFV invariant and the floor price credible from day one. They are acquired through the protocol's own market mechanisms, not through a one-off allocation.

#### Initial Reserve Targets

| Asset | Source | Verification | Rationale |
| :--- | :--- | :--- | :--- |
| USDC / USDC stable reserves | LBP proceeds, standard bond deposits, and direct reserve contributions | On-chain balances in the SHIT Protocol treasury modules and `TreasuryValuation`; stablecoin price feed | Deep, liquid backing that supports the floor and absorbs redemptions |
| Impact tokens — Solarcoin, Treegens, DOVU, Regen, KVCM, CEN | PSM collateral deposits, standard bonds, and partner/OTC onboarding through `TokenOnboardingManager` | `TokenRegistry` whitelist + `ImpactOracleAdapter` Uniswap V3 TWAP pricing + governance timelock | Real-world environmental backing; approved collateral for Bucky |
| Protocol-Owned Liquidity (SHIT/USDC, SHIT/impact LP positions) | LBP seeding, treasury LP seeding, and RBS wall/cushion operations | LP token balances in the treasury; yield from gauge adapters via `YieldRouter` | Owned, permanent liquidity that generates trading fees for stakers |
| Bucky minted against impact collateral | `ShitPsm` overcollateralized minting | Collateralization ratio, oracle price, and DSS liquidation module (`ShitCollateralManager` / `Dog`) | Productive stablecoin supply that loops back into treasury revenue |

#### Phased Acquisition Flow

1. **Phase 0 — LBP / Launch.** A Liquidity Bootstrapping Pool or initial market event raises USDC and seeds SHIT liquidity. A portion of the proceeds is deposited to the treasury as the first reserve backing.
2. **Phase 1 — Bond Market Activation.** Standard bonds open, letting users deposit USDC or approved impact assets and receive discounted, vested SHIT. Bond deposits flow directly to the treasury.
3. **Phase 2 — Impact Onboarding.** Approved impact tokens pass through `TokenOnboardingManager`'s 2-day timelock, are added to `TokenRegistry`, and become eligible as PSM collateral or bond deposits.
4. **Phase 3 — POL Deployment.** The treasury deploys owned liquidity across Uniswap V4, Curve, and Balancer; gauge adapters begin harvesting rewards back to stakers.
5. **Phase 4 — Bucky & AMOs.** The PSM begins minting Bucky against impact collateral; the Lending AMO and Uniswap V4 AMO put Bucky to work, earning yield that flows back to the treasury.

#### Verification & Safety

Every asset is verified before it counts toward RFV/NAV:

- **Whitelisting.** `TokenRegistry` only accepts tokens approved by governance.
- **Pricing.** `ImpactOracleAdapter` prices impact tokens via Uniswap V3 TWAP; stablecoins use the fixed-price feed; POL positions are priced from actual pool reserves.
- **Haircuts.** `TreasuryValuation` applies conservative haircuts — 0% on USDC, 2% on Morpho deposits, 50% on impact tokens, 50% on POL — so RFV reflects a worst-case liquidation value.
- **Timelock.** New collateral types, reserve valuations, and large treasury movements are gated by governance timelock and the Safe multisig, leaving no unilateral path to alter backing.

This means the protocol does not start with a pre-assigned treasury; it grows treasury backing through transparent, market-based, verifiable mechanisms from the first block.

---

## 10\. Vaults & Meta-Vaults

For users who want yield without managing strategy allocation themselves, SHIT Protocol offers a full **ERC-4626** vault stack.

**Vaults** come in four adapter types: **auto-compound** (reinvests rewards automatically), **leverage loop** (up to 3× leveraged yield through iterative borrow-and-redeposit), **liquidity** (manages LP positions and harvests fees), and **singleton** (a gas-optimized adapter managing multiple vaults in a single contract).

**Meta-vaults**, built on **Morpho Vault V2**, go a level further: they hold a basket of underlying strategies at once. The `ShitVaultCurator` sets and rebalances allocation targets across adapters — stSHIT staking, ShitSwap LP, Cooler lending, external LP positions, and bribe harvesting. The `ShitVaultOracle` prices the whole basket in real time, the `ShitWithdrawalQueue` handles sequential redemptions when underlying strategies have withdrawal delays, and the `ShitFeeManager` charges performance fees (capped at 20%) and management fees (capped at 2% annually) — both hard-capped so incentive structures never run away from the value they're meant to reward.

---

## 11\. Advanced Financial Primitives

Beyond the core system, SHIT Protocol connects to a set of specialized DeFi primitives — deliberately built on external, audited infrastructure rather than custom contracts, to minimize surface area while maximizing functionality.

**Yield trading (Pendle).** stSHIT can be wrapped into a Standardized Yield token and split into a **Principal Token** (redeemable for the underlying at maturity) and a **Yield Token** (the right to all yield generated until then) — enabling fixed-yield strategies, yield speculation, and hedging, entirely through Pendle's own infrastructure.

**Lending.** Permissionless **Cooler loans** let holders borrow against SHIT collateral without selling their position, matched automatically between borrowers and lenders. SHIT Protocol can also spin up custom **Morpho V2** markets, configuring asset, collateral, LLTV, interest rate model, and oracle per market.

**Perpetual trading.** A GMX V1-style perpetuals system lets traders go long or short on-chain assets using Bucky as collateral, with funding rates that continuously rebalance long and short interest, and flash-loan-powered liquidations that let anyone liquidate underwater positions without needing their own capital.

**Index vaults.** Built on **Reserve**, index tokens hold a self-rebalancing basket of assets at target weights, wrapped in an ERC-4626 vault (`ShitIndexVault`) with a management fee capped at 20% annually and priced continuously via `ShitIndexOracle`.

**Reserve Backed Stability (RBS).** An SHIT Protocol V3-derived price-band system with hard **wall** boundaries (where the protocol actively defends price) and softer inner **cushion** boundaries (an early-warning zone), automatically managed by the `RANGE` module against a moving-average target price.

**Vote markets & bribe aggregation.** SHIT Protocol directs its gauge emissions through established third-party vote markets — StakeDAO, Paladin, yBribe, Votium, Hidden Hand, and Aerodrome — claiming and forwarding bribes through each platform's native tooling.

---

## 13\. Supporting Infrastructure

A protocol this interconnected needs infrastructure that most users never see directly.

**Pricing.** `ShitPriceFeed` aggregates Chainlink feeds with TWAP smoothing to provide manipulation-resistant pricing for SHIT, Bucky, and every impact token in the system.

**Token governance.** A `TokenRegistry` whitelist controls which assets can enter the treasury or serve as collateral. New tokens pass through a **2-day timelock** via the `TokenOnboardingManager` before activation, with proposals expiring after 14 days if unused — deliberately slow, by design.

**Automation.** Time-sensitive operations — premium selling, peg defense, liquidations, valuation updates — run through a permissionless keeper pattern (following SHIT Protocol's "Heart" model): any keeper can trigger execution when on-chain conditions are met, with no manual intervention required. More complex, judgment-intensive operations, like liquidity migration, are handled deliberately by multisig rather than full automation.

**Deployment.** The `ShitDeployer` uses CREATE2 for deterministic contract addresses, rolling out the system in three phases — core token and treasury infrastructure, then trading and stablecoin systems, then advanced products like lending and perps — before a final `initializeContracts()` pass wires every cross-contract permission into place.

**Frontend.** A React 19 / TypeScript / Tailwind application (wagmi, viem, RainbowKit, TanStack Query) gives users a full interface across protocol dashboards, staking, bonds, governance, vaults, and the PSM, styled with a custom OKLCH-based design system in Neue Haas Grotesk Display Pro, in both light and dark themes.

**The subgraph.** Deployed on The Graph, the subgraph indexes every transfer, mint, burn, proposal, vote, and treasury balance so the frontend never has to scan raw chain data to answer a simple question.

**Tokenomics Simulation Lab.** Before capital ever touches the protocol, its logic can be stress-tested directly in the browser — Python models compiled to WebAssembly via Pyodide, mirroring the actual smart contract math for staking, treasury, floor hook, bonding, and stablecoin behavior. Nine predefined scenarios — from bull and bear markets to death spirals, floor depletion, stablecoin depeg, governance attacks, black swans, and full dissolution — let anyone verify how the system behaves under stress before trusting it with real capital.

---

## 14\. Security

SHIT Protocol layers security controls across access, execution, and verification.

- **Role-based access control** (OpenZeppelin v5): a three-tier hierarchy of `DEFAULT_ADMIN_ROLE` (governance), `MANAGER_ROLE` (operations), and `KEEPER_ROLE` (narrowly scoped automation), so that no single compromised role exposes the full system.  
- **Reentrancy guards** on every state-changing, token-transferring function.  
- **Pausability** on critical contracts like the PSM and PegKeeper, giving the team an emergency stop in the event of a live incident.  
- **No hardcoded keys** — all sensitive operations authenticate through environment-provided credentials, never source-embedded secrets.  
- **Formal verification (Halmos)** proves critical invariants — like the RFV invariant — hold under all possible inputs, not just tested ones.  
- **Fuzz testing (Echidna)** throws large volumes of randomized inputs at the contracts to surface edge cases formal proofs and manual review might miss.  
- **Frontend hardening** — enforced pnpm usage, frozen lockfiles, continuous integration, and Snyk dependency scanning.

---

## 15\. System Dynamics — The Flywheels

No individual mechanism in SHIT Protocol is meant to be evaluated alone. Four cycles run continuously, each reinforcing the others.

**The reward cycle.** Users acquire SHIT through bonds, the LBP, or the open market, then stake it for stSHIT. Staking rewards — from POL fees, gauge emissions, bribes, and supplemental emissions — flow to stakers, which draws in more staking, which shrinks circulating supply, which supports price, which grows POL fee revenue, which feeds back into rewards.

**The backing cycle.** The treasury holds real assets; RFV is calculated conservatively; the RFV invariant caps issuance to what that backing supports; the floor hook translates that backing into a hard price floor; the floor gives users confidence SHIT can't go to zero; confidence attracts more capital; more capital deepens the treasury; a deeper treasury raises the floor further.

**The Bucky economy.** Approved impact assets mint Bucky through the PSM; Bucky circulates as perps collateral, Cooler loan currency, and AMO liquidity; the PegKeeper holds it at $1; lending interest and trading fees flow back to the treasury, deepening the backing behind SHIT itself.

**The control layer.** stSHIT holders govern every lever above — fees, ratios, thresholds, collateral whitelisting, treasury withdrawals, new strategies — with every change passing through a timelock before it takes effect, so the community always has a window to react before a decision becomes final.

---

## 16\. Risk Disclosures

SHIT Protocol is designed with multiple layers of protection, but no DeFi protocol is risk-free. Material risks include: smart contract vulnerabilities despite audits, formal verification, and fuzz testing; oracle failure or manipulation affecting pricing and collateralization; impact-token collateral volatility beyond what treasury haircuts anticipate; governance risk, including low-turnout votes or adversarial proposals; dependency risk from integrated protocols (Uniswap, Curve, Balancer, Morpho, Pendle, Folio, Bond Protocol); regulatory uncertainty around tokenized environmental assets and stablecoins; and general market risk, including scenarios modeled in the Tokenomics Simulation Lab such as death spirals or black-swan events. This document is not financial advice; participants should assess these risks independently before engaging with the protocol.

---

## 17\. Conclusion

SHIT Protocol is an attempt to answer a specific question: what does decentralized finance look like when it's built around real environmental assets instead of purely speculative ones?

The answer, in practice, is a protocol where every component earns its place because it strengthens another. The RFV invariant and floor hook keep SHIT honest. Protocol-owned liquidity keeps markets deep without renting them. Bucky turns impact assets into usable, stable money. Vaults, meta-vaults, lending, perps, and index products give that liquidity somewhere productive to go. Governance, gated by a timelock, keeps the whole system accountable to the people who use it. And the simulation lab means none of this has to be taken on faith — the mechanics can be stress-tested before a single dollar moves.

The protocol's priorities are, in order: **safety** — provable on-chain; **sustainability** — revenue that comes from real activity, not emissions alone; **transparency** — nothing that happens off-chain except where human judgment genuinely improves on automation; and **access** — a system usable by newcomers and sophisticated DeFi users alike.

Environmental capital deserves the same liquidity, composability, and yield infrastructure that the rest of crypto has spent a decade building. SHIT Protocol is that infrastructure.

---

## 18\. Glossary

- **AMM** — Automated Market Maker; executes trades via mathematical pricing formulas instead of order matching.  
- **AMO** — Algorithmic Market Operations; strategies that deploy Bucky to earn yield while preserving its peg.  
- **Bucky** — SHIT Protocol's USD-pegged, multi-collateral, overcollateralized stablecoin.  
- **Bond** — A mechanism to acquire SHIT at a discount in exchange for a vesting period.  
- **Cooler Loan** — Permissionless lending, borrowing Bucky against SHIT collateral.  
- **ERC-4626** — The standard interface for tokenized yield vaults.  
- **Epoch** — An 8-hour period used for staking reward distribution.  
- **Floor Price** — The minimum price of SHIT, enforced by treasury backing.  
- **Haircut** — A conservative discount applied to a treasury asset when calculating RFV.  
- **Kernel / Policy** — SHIT Protocol's core architecture pattern: modules hold state, policies implement logic against explicit permissions.  
- **LBP** — Liquidity Bootstrapping Pool; a descending-price mechanism for fair token launches.  
- **Meta-Vault** — A vault that allocates across multiple underlying yield strategies.  
- **NAV** — Net Asset Value; full treasury value with no haircuts applied.  
- **PegKeeper** — Automated system defending Bucky's $1 peg.  
- **POL** — Protocol-Owned Liquidity; liquidity the protocol owns outright rather than rents.  
- **PSM** — Peg Stability Module; handles Bucky minting and redemption against approved collateral.  
- **RBS** — Reserve Backed Stability; a price-band system with walls and cushions.  
- **RFV** — Risk-Free Value; the conservative, haircut-adjusted valuation of treasury assets.  
- **SHIT** — SHIT Protocol's core governance token, capped at 100 million supply.  
- **Stablecoin** — A cryptocurrency designed to hold a stable price, typically $1.  
- **stSHIT** — Rebasing receipt token for staked SHIT.  
- **Subgraph** — An indexing layer that makes on-chain data efficiently searchable.  
- **TWAP** — Time-Weighted Average Price; an average resistant to short-term manipulation.  
- **Vyper** — A Python-like smart contract language used for SHIT Protocol's security-critical stablecoin components.  
- **wstSHIT** — A non-rebasing, fixed-balance wrapper for stSHIT.

---

## 19\. The SHIT Protocol Roadmap

### Building the financial infrastructure for environmental capital, one phase at a time

---

Every phase of SHIT Protocol is built to stand on the one before it. The treasury has to exist before it can back a stablecoin. The stablecoin has to be liquid before vaults have anything worth compounding. It's sequenced because each layer is genuinely load-bearing for the next.

Five phases. One system, growing outward from a treasury-backed core.

---

### Phase 1 — Foundation `live`

**The root system goes in first.**

Before SHIT Protocol can do anything ambitious, it needs ground to stand on: a token with a real floor, a treasury, and a community that can steer it. Phase 1 is the SHIT Protocol V3 fork — the proven core that everything downstream depends on.

- **SHIT token launch** — a 100M hard-capped supply, governed by the RFV invariant from day one  
- **Staking and bonding live** — stSHIT rebasing rewards, standard and inverse bonds, the premium seller pressure valve  
- **Treasury and protocol-owned liquidity** — RFV/NAV tracking, idle-capital limits, POL across Uniswap V4

*Why it's first: nothing else in this roadmap works without a treasury that can back it and a community that can govern it.*

---

### Phase 2 — Stable Ground `next`

**Impact assets become spendable money.**

This is where the protocol's thesis becomes tangible. Once treasury liquidity is deep enough to support it, Bucky lets holders mint stable, usable dollars directly against real environmental collateral — carbon credits, conservation tokens, clean-energy assets — treating impact tokens as productive financial collateral rather than illiquid holdings.

- **Bucky stablecoin and PSM** — mint against approved impact assets at governance-set collateralization ratios  
- **Multi-collateral onboarding** — a growing whitelist of impact tokens, each with its own oracle and risk parameters  
- **PegKeeper live** — automated, keeper-triggered peg defense keeping Bucky at $1  
- **Lending and liquidity AMOs** — Bucky deployed productively into Morpho markets and Uniswap V4 pools

*Why it's second: a stablecoin is only as strong as the treasury behind it — this phase waits for Phase 1's liquidity to deepen impact liquidity to make Bucky's peg genuinely defensible, not just promised.*

---

### Phase 3 — Compounding Growth `planned`

**Deposits start working for themselves.**

With a token, a treasury, and a stablecoin in place, the next layer is automation — giving capital somewhere productive to go without requiring active management from every user.

- **ERC-4626 vaults** — auto-compound, leverage loop, liquidity, and singleton adapters  
- **Meta-vaults on Morpho V2** — curated, multi-strategy baskets with real-time NAV pricing  
- **Cooler loans** — permissionless borrowing against SHIT without selling a position  
- **Morpho markets** — custom lending markets with configurable collateral and rate models

*Why it's third: yield infrastructure needs liquid markets and a stable unit of account to compound into — both arrive in Phases 1 and 2\.*

---

### Phase 4 — Advanced Markets `planned`

**Sophisticated tools, built on a proven base.**

By this point, the protocol has a track record: a floor price that's held, a peg that's defended, vaults that have compounded real yield. That track record is what makes it safe to layer in more advanced — and more powerful — financial primitives.

- **Perpetual trading** — long and short positions against Bucky collateral, GMX V1-style  
- **Pendle yield trading** — split stSHIT into principal and yield tokens for fixed-rate strategies or yield speculation  
- **Folio index vaults** — self-rebalancing baskets of impact and DeFi assets  
- **Reserve Backed Stability** — price-band defense with automated walls and cushions

*Why it's fourth: leverage, derivatives, and yield-splitting are the highest-risk layer in the stack — they deserve a protocol that's already proven it can hold its own peg and floor under real market conditions.*

---

### Phase 5 — Ecosystem Maturity `horizon`

**A self-sustaining hub for environmental capital.**

The long-term destination isn't a bigger version of the same protocol — it's a genuinely decentralized hub that other builders and asset issuers plug into.

- **Vote market aggregation** — directing and capturing bribes across StakeDAO, Votium, Hidden Hand, and others  
- **New impact-asset partnerships** — expanding the collateral base beyond the initial whitelist  
- **Cross-chain expansion** — bringing SHIT Protocol's treasury model to new environments  
- **Full DAO handoff** — decentralized governance assuming complete operational control

*Why it's last: real decentralization is earned, not declared — it's the outcome of four phases of the system proving it can run itself.*

---

### The Thread Running Through All Five

Every phase adds a capability, growing treasury, Bucky's peg, the vaults' yield, the perps' collateral, the index baskets' composition — all of it sits on top of the same treasury discipline established in Phase 1\. That's the point. Growth here isn't about adding features for their own sake; it's about giving a genuinely well-backed system more surface area to do good, compounding work.

---

*This roadmap reflects current protocol priorities and sequencing logic. Timelines are deliberately expressed as phases rather than fixed dates — each phase begins when its prerequisites are met on-chain, not on a calendar. Roadmap details are subject to change via governance.*

---

*This whitepaper is for informational purposes only and does not constitute financial advice. Participation in DeFi protocols carries risk, including smart contract vulnerabilities, market volatility, and potential loss of principal. Conduct independent research before participating.*

*SHIT Protocol smart contracts are licensed under AGPL-3.0-only unless otherwise noted.*

