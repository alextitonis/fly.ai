# SHIT Protocol — Technical Documentation

Full-stack DeFi protocol for environmental impact tokens. SHIT Protocol combines bonding, protocol-owned liquidity (POL), a stablecoin (Bucky), governance, yield-bearing vaults, and perpetual trading into a single integrated system built on Ethereum.

## Table of Contents

- [Overview](#overview) · [Monorepo Structure](#monorepo-structure) · [Protocol Architecture](#protocol-architecture)
- [Smart Contracts](#smart-contracts) · [Frontend](#frontend) · [Services](#services)
- [Deployment](#deployment) · [Security](#security) · [Upstream Repos](#upstream-repositories) · [License](#license)

> **Note:** This is the single consolidated README. There are no sub-directory README files — all documentation lives here.
> See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute via Radicle.

---

## Overview

SHIT Protocol is a DeFi protocol on Base that enables:

1. **Token issuance** — SHIT ERC20 with 100M max supply and multisig-gated minting.
2. **Staking** — Rebasing stSHIT (8-hour epochs, POL yield + supplemental emissions, circuit-breaker protected) with a non-rebasing wstSHIT wrapper (Lido wstETH pattern) for DeFi composability.
3. **Bonding** — Inverse bonds: a standing buyback bid at NAV × (1 − spread) that burns received SHIT. Circuit-breaker protected, adjustable capacity. Standard discount bonds are sold via Bond Protocol's own infrastructure, not custom contracts.
4. **Stablecoin (Bucky)** — Multi-collateral CDP stablecoin forked from MakerDAO DSS, with Curve `StableSwap`/`PegKeeper` (Vyper) for peg defense and TWAP-based collateral oracles.
5. **Referrals** — On-chain referral registry with fee splitting and Hedgey vesting-bonus integration.
6. **Oracle & Safety** — Uniswap V3 TWAP price feeds and a global circuit breaker that halts dependent modules (inverse bonds, defense budget) if Bucky depegs. 21-epoch recovery period prevents whipsaw re-enabling.
7. **NAV Warmup Ramp** — Supplemental mint amount in `ShitStaking` ramps up gradually during the initial epochs after launch to prevent sudden inflation at low supply.

Governance is off-chain via a Safe multisig (`MultisigGuard`) — there is no on-chain governance contract. Larger DeFi primitives referenced by the frontend (vaults, lending, perps, index tokens, yield trading, POL across multiple venues) are accessed by integrating directly with external protocols (Yearn, Morpho, GMX, Pendle, etc.) rather than through custom SHIT Protocol contracts — see the `// no custom ... contracts` comments in `contracts/script/DeployAll.s.sol` for the exact split.

## Monorepo Structure

The repo is intentionally flat — most directories have no further subfolders, and files are named `<domain>-<description>.ext` so related files sort and grep together without needing nested directories.

```
shit-finance/
├── contracts/          # Solidity smart contracts (Foundry)
│   ├── src/            # Protocol source contracts (flat, ~39 files)
│   ├── script/         # Foundry deployment scripts (DeployAll, DeployShitFork)
│   ├── test/           # Solidity tests (single consolidated SHITFinance.t.sol)
│   └── lib/            # Git submodule dependencies (external protocols)
├── frontend/           # React/TypeScript frontend (Vite + wagmi + Tailwind)
│   ├── components/     # Shared React components, modals, and UI primitives (flat)
│   ├── hooks/          # Custom React hooks, prefixed by domain (flat)
│   ├── lib/            # Utilities, config, math, mocks (flat)
│   ├── modules/        # Feature-organized pages/hooks/libs, prefixed by feature (flat)
│   ├── layouts/        # App shell layout components
│   ├── abis/           # Contract ABIs as TypeScript `as const` exports
│   ├── icons/, css/, public/  # Static assets and design system
│   └── tokenomics/     # Standalone tokenomics simulator (plain HTML/JS)
├── services/           # Independently deployed Cloudflare Workers
│   ├── api-worker/          # Aggregated market/risk data API (DB-backed)
│   ├── eth-faucet-worker/   # Testnet ETH faucet
│   └── wallet-verify-worker/ # Wallet verification endpoint
└── repos/              # Upstream reference repos (not tracked in git)
```

## Protocol Architecture

The protocol uses the **SHIT Protocol V3 Kernel & Policy** pattern:

- **Kernel** — Central module registry. Modules register and expose functions that Policies can request permission to call.
- **Policies** — Contracts that configure and interact with Kernel modules. Each declares dependencies via `configureDependencies()` and `requestPermissions()`.

### Key Design Principles

1. **Multisig Everything** — Most contracts inherit `MultisigGuard`, which gates admin/manager functions behind a single Safe multisig address (with a 3-day timelock on transferring multisig control). There is no on-chain governance contract.
2. **RFV/NAV Tracking** — `TreasuryValuation` computes NAV and risk-free value (RFV) from registered treasury assets (with per-asset haircuts) and gates `ShitStaking.rebase()` supplemental emissions.
3. **Fail-Closed Oracles** — `ShitPriceFeed`/`ImpactOracleAdapter` revert on stale or insufficient TWAP observations rather than returning a stale price.
4. **Access Control** — `MultisigGuard` (`onlyMultisig`) is the primary pattern; `TokenRegistry` and `ImpactOracleAdapter` additionally use OpenZeppelin `AccessControl` roles for day-to-day (non-multisig) operations.
5. **Permissionless Automation** — `rebase()`, `check()` (circuit breaker), and liquidation keeper functions are permissionless so any keeper/bot can trigger them.
6. **Reentrancy Protection** — State-changing token-transfer functions use `ReentrancyGuard`/`Pausable` where applicable.

### Radicle Origin

This project originated on Radicle:
- **RID:** `rad:z2kY22UBjvyrbxfKZftjF4H66C7Wx`
- **Node:** `rosa.radicle.network`
- **Explorer:** https://radicle.network/nodes/rosa.radicle.network/rad:z2kY22UBjvyrbxfKZftjF4H66C7Wx

---

## Smart Contracts

**Directory:** `contracts/` — built with [Foundry](https://getfoundry.sh), licensed **AGPL-3.0-only** unless noted. All ~39 contracts live directly in `contracts/src/` (flat, no subdirectories).

### Token

- **`ShitToken.sol`** — ERC20 with permit, burnable, multisig-gated minting, 100M max supply
- **`TokenRegistry.sol`** — AccessControl whitelist for approved impact tokens
- **`TokenOnboardingManager.sol`** — Timelock-gated token onboarding (2-day delay)
- **`ImpactTokens.sol`** — Canonical impact token addresses and metadata

### SHIT Protocol V3 Forks (Staking, Treasury, Bonds)

- **`ShitStaking.sol`** — Rebasing stSHIT token, 8-hour epochs, POL yield + supplemental emissions
- **`wstSHIT.sol`** — Non-rebasing wrapper (Lido wstETH pattern)
- **`StakingAdapter.sol`** — Bridges ShitStaking to SHIT Protocol V3 IStaking interface
- **`TreasuryValuation.sol`** — RFV/NAV tracking via SHIT Protocol TRSRYv1, multisig-gated
- **`ITreasuryPolicy.sol`** / **`IValuationCalculator.sol`** — Interfaces for treasury valuation
- **`ShitPrice.sol`** — Fork of SHIT ProtocolPrice using TWAP instead of Chainlink
- **`ShitDistributor.sol`** — Bridges SHIT Protocol Heart beat to ShitStaking rebase
- **`ShitDefenseBudget.sol`** — Per-epoch treasury spending cap wrapping Operator.operate(). Circuit-breaker protected (halts when CB is tripped).
- **`ShitBondPricer.sol`** — Dynamic bond discount tied to treasury/RFV growth ratio
- **`ShitInverseBond.sol`** — Standing buyback bid at NAV x (1 - spread), burns received SHIT. Circuit-breaker protected (halts when CB is tripped). Adjustable capacity via `maxCapacityBps`.

### Oracle

- **`ShitPriceFeed.sol`** — TWAP price feed from Uniswap V3 pool, implements IPriceFeed + ITwapPriceFeed
- **`StablecoinPriceFeed.sol`** — Fixed $1 price feed for stablecoin collateral
- **`TwapLibrary.sol`** — Uniswap V3 TWAP calculation library (wraps V4 TickMath/FullMath)
- **`IPriceFeed.sol`** / **`ITokenPriceFeed.sol`** / **`ITwapPriceFeed.sol`** — Price feed interfaces

### Stablecoin (Bucky)

Multi-collateral Bucky stablecoin using MakerDAO DSS infrastructure:

- **`Bucky.sol`** — DSS Dai fork with configurable name/symbol, auth-gated mint/burn via wards
- **`ShitCollateralManager.sol`** — Registers collateral types (ilks) in DSS, deploys cloneable GemJoin/Clipper/OSM
- **`ImpactOracleAdapter.sol`** — TWAP-based price oracle for impact token collateral
- **`OraclePipAdapter.sol`** — Wraps ITokenPriceFeed into DSS PipLike interface
- **`ShitLiquidationKeeper.sol`** — Flash-loan liquidation keeper (DSS ClipperCallee pattern)
- **`ShitTreasuryIntegration.sol`** — OZ TimelockController for treasury spell execution
- **`FixedRateProvider.sol`** — Fixed interest rate provider for PSM
- **`StableSwap.vy`** — Curve 2-coin AMM for Bucky/USDC (Vyper, Curve.Fi)
- **`PegKeeperOptimized.vy`** — Curve PegKeeper for peg defense (Vyper, Curve.Fi, MIT)
- **`CloneableAbacus.sol`** / **`CloneableClipper.sol`** / **`CloneableGemJoin.sol`** / **`CloneableOSM.sol`** — ERC-1167 clone implementations for DSS

### Security

- **`ShitCircuitBreaker.sol`** — Global Bucky depeg circuit breaker (21-epoch recovery period to prevent whipsaw re-enabling during stress)
- **`MultisigGuard.sol`** — Shared multisig access control modifier

### Referral

- **`ReferralRegistry.sol`** — UUPS upgradeable referral registry with fee splitting and Hedgey bonus
- **`IReferralRegistry.sol`** / **`IReferralFeeSource.sol`** / **`IHedgeyClaimCampaigns.sol`** — Interfaces

### Deployer

- **`ShitDeployer.sol`** — CREATE2 deterministic deployment with vanity salts

### Test Files

All tests are consolidated into a single file `contracts/test/SHITFinance.t.sol` covering: tokens, staking, treasury, oracle, bonds, circuit breaker, defense budget, bond pricer, collateral manager, liquidation keeper, cloneable DSS components, stablecoin integration, multisig guard, referral registry, deployer, and deployment flow.

### Scripts

- **`DeployAll.s.sol`** — Unified deployment, deploys everything in dependency order
- **`DeployShitFork.s.sol`** — SHIT Protocol V3 fork components only (Kernel, modules, policies)

### Dependencies

External libraries tracked as git submodules in `contracts/lib/`:

- **OpenZeppelin Contracts v5** — AccessControl, ERC20, SafeERC20, ReentrancyGuard, Pausable, Clones
- **SHIT Protocol V3** — Kernel, Policy, Module framework, Operator, Heart, Range, ROLES, MINTR, TRSRY
- **MakerDAO DSS** — Vat, Spotter, Dog, DaiJoin, Clipper, Abaci (for Bucky stablecoin)
- **Solmate** — ERC20, Auth
- **Bond Protocol** — BondAggregator, BondFixedTermTeller, BondFixedTermSDA
- **Uniswap V4** — TickMath, FullMath (for TwapLibrary)

### Build & Test

```bash
cd contracts
forge build
forge test
forge test --coverage
forge test --fuzz-runs 1000
```

## Upstream Repositories

The codebase is built by adapting open-source protocol repos. The `repos/` directory contains local clones for reference. These are **not** part of the git repo.

### Frontend Upstreams

| Upstream Repo | GitHub URL | License | Usage |
|---------------|-----------|---------|-------|
| SHIT Protocol v2 (primary base) | `https://github.com/SHIT Protocol/shit-protocol-frontend-v2` | MIT | App shell, layout, design system, staking/governance/treasury modules |
| Bond Protocol DApp | `https://github.com/Bond-Protocol/dapp` | MIT | Bond marketplace UI patterns |
| Balancer Frontend | `https://github.com/balancer/frontend-monorepo` | MIT | LBP / gauge patterns |
| Morpho Lite Apps | `https://github.com/morpho-org/morpho-lite-apps` | AGPL-3.0 | Lending / meta-vault UI patterns |
| Yearn Finance | `https://github.com/yearn/yearn.fi` | GPL-3.0 | Vault / yield strategy UI patterns |
| GMX Interface | `https://github.com/gmx-io/gmx-interface` | BUSL-1.1 | Perps / trading UI patterns |
| Index Coop App | `https://github.com/IndexCoop/index-app` | MIT | Index token UI patterns |

### Contract Upstreams (Foundry submodules)

External contract dependencies are managed via git submodules in `contracts/lib/`. See `contracts/.gitmodules` for the full list (~28 submodules). **Only the ones below are actually imported by current contracts** (see `contracts/README.md` → Dependencies); the rest (Morpho, Yearn, GMX, Reserve Index DTF, Balancer, Lido, Pendle, Spark PSM, Euler, Uniswap V2, etc.) were vendored for a larger, earlier version of the protocol and are not currently referenced by any file in `contracts/src/` — treat them as unused until a contract actually imports them.

| Upstream Repo | GitHub URL | Usage |
|---------------|-----------|-------|
| forge-std | `https://github.com/foundry-rs/forge-std` | Foundry test stdlib |
| OpenZeppelin Contracts | `https://github.com/OpenZeppelin/openzeppelin-contracts` | ERC20, AccessControl, etc. |
| SHIT Protocol V3 | `https://github.com/SHIT Protocol/shit-protocol-v3` | Kernel, treasury, policies |
| Uniswap V4 Hooks | `https://github.com/Uniswap/v4-hooks-public` | `TwapLibrary` (TickMath/FullMath) |
| Bond Protocol | `https://github.com/Bond-Protocol/bond-contracts` | Solmate (nested dependency) |
| MakerDAO DSS | `https://github.com/makerdao/dss` | Bucky stablecoin (Vat, Spotter, Dog, DaiJoin, Abaci) |

### Re-clone upstream repos

```bash
# Frontend reference repos
mkdir -p repos
cd repos
git clone https://github.com/balancer/frontend-monorepo.git balancer-frontend
git clone https://github.com/Bond-Protocol/dapp.git bond-protocol-dapp
git clone https://github.com/gmx-io/gmx-interface.git gmx-interface
git clone https://github.com/IndexCoop/index-app.git index-coop-app
git clone https://github.com/morpho-org/morpho-lite-apps.git morpho-apps
git clone https://github.com/yearn/yearn.fi.git yearn-frontend

# Contract submodules
cd ../contracts
git submodule update --init --recursive
```

---

## Frontend

**Directory:** `frontend/` — unified React frontend for SHIT Protocol. Single-page scrolling architecture with 3-column desktop layout (icon sidebar + sub-nav + main content). Files are flat in `frontend/` (no `src/` subdirectory); modules and hooks use `<domain>-<description>.ext` prefix naming so related files sort and grep together without nested folders.

### Tech Stack

React 19, TypeScript 5.8, Vite 7 (SWC), Tailwind CSS 4, wagmi 2, viem 2, RainbowKit 2, TanStack React Query 5, React Router 8 (hash-based), Orval (OpenAPI codegen), Biome (lint/format), CVA.

### Frontend Layout

```
frontend/
├── main.tsx                  # Application entry point
├── routes.tsx                # Route definitions (React Router, hash-based)
├── index.html                # HTML template
├── tests.test.tsx            # Consolidated test suite
├── generated-shitUnits.ts # Auto-generated API client (do not edit — run `pnpm codegen`)
├── abis/                     # Smart contract ABIs (TypeScript `as const` exports for viem)
├── components/               # Shared React components, modals, and UI primitives (flat)
├── hooks/                    # Custom React hooks (flat, domain-prefixed)
├── lib/                      # Config, math, mocks, utils (flat, domain-prefixed)
├── layouts/                  # App shell layout components (flat)
├── modules/                  # Feature-organized pages/hooks/libs (flat, domain-prefixed)
├── css/                      # Global stylesheets (Tailwind CSS 4 + OKLCH theme tokens)
├── icons/                    # SVG/PNG/WebP icons (chains, tokens, wallet logos)
├── public/                   # Static assets served as-is
├── tokenomics/               # Standalone tokenomics simulator (plain HTML/JS)
├── scripts/                  # Build/ops helper scripts
├── vite.config.ts            # Vite build configuration
├── vitest.config.ts          # Vitest test configuration
├── tsconfig.json             # TypeScript configuration
├── tsconfig.app.json         # TypeScript app config (used by tsc --noEmit)
├── biome.json                # Biome lint/format configuration
├── orval.config.ts           # Orval OpenAPI codegen configuration
└── package.json              # Dependencies and scripts
```

### Conventions

- **File naming**: `kebab-case` for all files. Domain-prefixed files use `<domain>-<description>.ext` (e.g., `cooler-useMonoCoolerPosition.ts`, `math-SharesMathLib.ts`, `ui-button.tsx`).
- **Import paths**: Use `@/` alias for the frontend root (e.g., `import { Button } from "@/components/ui-button"`).
- **UI primitives**: Shared design system components live in `components/` as `ui-*.tsx` files (button, badge, card, dialog, input, table, tabs, tooltip, etc.).
- **Hooks**: Custom React hooks live in `hooks/` (flat). Domain-specific hooks are prefixed (e.g., `cooler-useMonoCoolerDebt.ts`, `liveness-useEpochTimer.ts`, `referral.ts`). General hooks use `use-*` prefix.
- **Modules**: Feature pages/hooks/libs live in `modules/` (flat). Each feature is prefixed (e.g., `izipay-izipay-dashboard-page.tsx`, `protocol-protocol-overview-page.tsx`, `shit-balance-page.tsx`).
- **No subdirectories within components/, hooks/, lib/, modules/**: everything is flat. This is intentional — it reduces import path complexity and makes `grep`/`find` faster.

### Design System

OKLCH color tokens in `css/` (light/dark). Three-level surface hierarchy. No Tailwind config file — uses `@theme inline` in `theme.css`. UI primitives in `components/ui-*.tsx` built on Base UI / CVA patterns.

### Frontend Setup

```bash
pnpm install
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm test         # Run tests (Vitest)
```

Requires Node.js 22+ and pnpm 11+.

### Key Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_WALLETCONNECT_PROJECT_ID` | Yes | WalletConnect Cloud project ID |
| `VITE_THEGRAPH_API_KEY` | Yes | The Graph Gateway API key |
| `VITE_SHIT_UNITS_API_ENDPOINT` | Yes | SHIT Protocol Units API base URL |
| `VITE_SHIT_SAFE_API_KEY` | Yes | Safe Transaction Service API key |
| `VITE_TESTNET_MODE` | No | Enable testnet chains (Sepolia) |

### Components (`frontend/components/`)

Shared React components used across modules. All files are flat — no subdirectories. UI primitives use the `ui-*.tsx` naming convention.

**Core Components:**

- **`providers.tsx`** — Root provider wrapper composing Wagmi, RainbowKit, React Query, and theme providers.
- **`web3-providers.tsx`** — Web3-specific provider stack (wagmi config, RainbowKit theme).
- **`theme-provider.tsx`** — Dark/light/system theme context via `next-themes`.
- **`dev-provider.tsx`** — Developer-mode provider (wraps dev toolbar).
- **`connect-button.tsx`** — RainbowKit wallet connection button with custom SHIT Protocol styling.
- **`error-boundary.tsx`** / **`error-screen.tsx`** / **`route-error-element.tsx`** — Error handling: boundary, display, and router-level error element.
- **`route-loading-fallback.tsx`** — Loading fallback for route-level Suspense.
- **`icon.tsx`** — Named icon registry mapping icon names to Lucide icons.
- **`shit-logo.tsx`** — SHIT Protocol SVG logo.
- **`lottie-icon.tsx`** — Lottie animation icon wrapper with fallback.
- **`price-change.tsx`** — Price change indicator (up/down arrow, color-coded percentage).
- **`transaction-steps.tsx`** — Multi-step transaction progress display (pending/confirmed/failed).
- **`feature-tour.tsx`** / **`feature-tour-welcome-modal.tsx`** — Interactive feature tour using driver.js.
- **`dev-toolbar.tsx`** — Developer toolbar (testnet only): quick links to mock data, contract addresses, debug tools.

**Modals:**

- **`wrap-shit-modal.tsx`** — Wrap SHIT → stSHIT.
- **`unstake-stshit-modal.tsx`** — Unstake stSHIT → SHIT.
- **`unwrap-wstshit-modal.tsx`** — Unwrap wstSHIT → stSHIT.
- **`migrate-shit-modal.tsx`** — V1 → V2 migration with Merkle proof.
- **`mint-testnet-shit-modal.tsx`** / **`mint-testnet-usds-modal.tsx`** — Testnet token minting (testnet only).

**UI Primitives (`ui-*.tsx`):** Reusable design system primitives built on Base UI / CVA patterns. All use Tailwind CSS classes and support dark/light themes.

Components: `ui-button`, `ui-badge`, `ui-card`, `ui-dialog`, `ui-dropdown-menu`, `ui-form`, `ui-input`, `ui-label`, `ui-number-flow`, `ui-progress`, `ui-separator`, `ui-sheet`, `ui-skeleton`, `ui-slider`, `ui-sonner` (toasts), `ui-table`, `ui-tabs`, `ui-token-big-input`, `ui-tooltip`, `ui-collapsible`

### Hooks (`frontend/hooks/`)

All custom React hooks. Files are flat — no subdirectories. Domain-specific hooks use a `<domain>-<description>.ext` prefix.

- **General hooks** (`use-*.ts(x)`): Token balances, allowances, approvals, transactions, staking APY, migration, wallet analytics, web vitals, scroll tracking, route prefetching, feature tour.
- **`cooler-*`**: Cooler lending protocol hooks — math, debt, position, capacity, calculations, authorization, smart-contract wallet detection.
- **`liveness-*`**: Epoch timer hooks for protocol liveness tracking.
- **`referral.ts`**: Referral system hooks (binding, earnings, stats).

```typescript
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useMonoCoolerPosition } from "@/hooks/cooler-useMonoCoolerPosition";
```

### Lib (`frontend/lib/`)

Shared library code. All files are flat — no subdirectories. Domain-specific files use a `<domain>-<description>.ext` prefix.

- **`chains.ts`**: Blockchain chain definitions and helpers (Base, Base Sepolia)
- **`constants.ts`**: Protocol constants (epoch durations, etc.)
- **`contracts.ts`**: Contract addresses and ABIs by chain
- **`tokens.ts`**: Token definitions (SHIT, stSHIT, wstSHIT, USDS, etc.)
- **`impact-tokens.ts`**: Impact token definitions
- **`analytics.ts`**: Analytics tracking functions
- **`attribution.ts`**: Attribution data suffix for transactions
- **`navigation.tsx`**: Navigation sections and helpers
- **`wagmi-config.ts`**: Wagmi web3 configuration
- **`migration-config.ts`**: V1 migration configuration
- **`treasury-subgraph-client.ts`**: GraphQL subgraph client
- **`helpers.ts`**: General utility functions (block explorer URLs, input handling)
- **`liveness-epoch.ts`**: Epoch liveness calculations
- **`impact-clarity-impact-clarity-types.ts`**: Impact clarity types and definitions
- **`math-*`**: Math libraries — `math-Constants.ts`, `math-MarketMath.ts`, `math-SharesMathLib.ts`, `math-formatting.ts`, `math-solady-FixedPointMathLib.ts`, `math-solady.ts`, `math.ts`
- **`mock-*`**: Mock data providers for development mode — `mock-provider.tsx`, `mock-fixtures-balances.ts`, `mock-fixtures-prices.ts`, `mock-scenarios.ts`, `mock-types.ts`
- **`utils-*`**: Utility functions — `utils.ts` (cn class merging, general), `utils-envio.ts` (Envio data parsing), `utils-token-amount.ts` (token amount parsing)

### Layouts (`frontend/layouts/`)

React layout components for the application shell. The app uses a 3-column desktop layout (icon sidebar + sub-nav + main content) with a responsive mobile layout.

- **`app-layout.tsx`** — Root layout component. Renders the 3-column desktop layout: `icon-sidebar` (left), `SubNav` (middle), and `Outlet` (main content). Wraps everything with `NuqsAdapter`, `Providers` (Wagmi/RainbowKit/ReactQuery), analytics tracking, and `ErrorBoundary`. On mobile, renders `mobile-nav` instead of sidebar + sub-nav.
- **`icon-sidebar.tsx`** — Floating pill-shaped sidebar with section icons. Uses `NAV_SECTIONS` from `navigation.tsx` to render navigation items. Implements `useScrollSpy` hook to highlight the active section based on scroll position. Fixed position on desktop, hidden on mobile.
- **`mobile-bottom-nav.tsx`** — Bottom navigation bar for mobile devices. Provides quick access to key sections.
- **`mobile-nav.tsx`** — Hamburger drawer for mobile that combines the icon sidebar and sub-nav into a single collapsible menu. Triggered by a hamburger button in the mobile header.
- **`footer.tsx`** — Sticky footer displaying real-time protocol data: Next Beat timer (countdown to next RBS beat), token prices (SHIT, BUCKY), gas tracker, and theme toggle button.

### Modules (`frontend/modules/`)

Feature-organized frontend modules. All files are flat — no subdirectories. Each feature uses a `<feature>-<description>.ext` prefix so related files sort together. The app uses a single-page scrolling architecture where most modules render as sections within the protocol overview page.

- **`protocol-*`** — Main protocol overview, the landing page that composes all protocol sections into a single-page scrolling experience. Includes protocol widgets, unified dashboard, and coming-soon pages.
- **`shit-*`** — SHIT token management — balance dashboard (all SHIT variants), wrap/stake flows, V1 migration with Merkle proof.
- **`bonds-*`** — Bond marketplace — standard and inverse bond purchasing UI.
- **`cooler-*`** — Cooler Loans — borrow against collateral, clearing house operations, loan management.
- **`rbs-*`** — Range Stability — price bands, buy/sell at wall prices, wall/cushion display.
- **`impact-*`** — Impact Tokens — clarity dashboard, token registry, onboarding, leaderboard, risk calculator, price feeds (CoinGecko, DefiLlama, DexScreener, GeckoTerminal).
- **`izipay-*`** — IziPay — card/vault management: dashboard, cards list, card detail, create vault, deposit, withdraw, claimback, vaults list. Integrates with Base L2 card vault contracts.
- **`referral-*`** — Referral program — bind referrer, earnings display, referral link card, stats, Hedgey bonus section.
- **`airdrop-*`** — Airdrop claim page.
- **`merch-*`** — Merch store page.
- **`verify-*`** — Verification page.
- **`pulse-*`** — Price history hooks — SHIT and wstSHIT price history data.
- **`contracts-*`** — Contract interaction pages.

### Protocol Module Details

The `protocol-*` files compose the landing page. Each section has an `id` attribute for scroll-spy navigation.

**Pages:**

- **`protocol-protocol-overview-page.tsx`** — Main landing page (~850 lines). Composes all protocol sections into a single scrolling page. Imports and renders module pages from `shit-*`, `bonds-*`, `rbs-*`, `cooler-*`, and protocol widget components. Key sections: Overview (`id="overview"`), Tokens (`id="tokens"`), Dashboard (`id="dashboard"`), Markets (`id="markets"`), Treasury (`id="treasury"`).
- **`protocol-unified-dashboard-page.tsx`** — Unified dashboard showing treasury metrics, NAV safety, and protocol health in a single view.
- **`protocol-coming-soon-page.tsx`** — Coming-soon placeholder for features not yet integrated (vaults, perps, index tokens, yield trading, etc.).
- **`protocol-tokenomics-lab-page.tsx`** — Tokenomics lab page — links to the standalone tokenomics simulator in `tokenomics/`.

**Widgets (`protocol-widget-*.tsx`):**

- **`protocol-widget-contract-widgets.tsx`** — Exports `TreasuryMetricsWidget` (RFV, NAV, floor price, NAV per SHIT), `PriceFeedWidget` (current SHIT price, TWAP), `POLManagementWidget` (POL positions with deposit/withdraw/harvest).
- **`protocol-widget-floor-market-widget.tsx`** — Floor market dashboard — floor price, redemption availability, USDC backing status.
- **`protocol-widget-faucet-widget.tsx`** — Testnet faucet widget (testnet only) — mint testnet SHIT/USDS.
- **`protocol-widget-merch-widget.tsx`** — Merch store widget — quick link to merch page.
- **`protocol-widget-protocol-launch-widget.tsx`** — Protocol launch widget — launch progress and milestone tracking.
- **`protocol-widget-yield-split-widget.tsx`** — Yield split visualization — shows how staking yield is split between POL fees, gauge emissions, and bribes.

---

## Services

**Directory:** `services/` — three independently deployed Cloudflare Workers:

| Worker | Path | Purpose |
|---|---|---|
| **api-worker** | `services/api-worker/` | Aggregated market/risk data API (DB-backed) |
| **eth-faucet-worker** | `services/eth-faucet-worker/` | Testnet ETH faucet |
| **wallet-verify-worker** | `services/wallet-verify-worker/` | Wallet verification endpoint |

Each worker is self-contained with its own `wrangler.toml` and dependencies.

---

## Deployment

### Contracts

```bash
cd contracts
cp .env.example .env   # Fill in: PRIVATE_KEY, SAFE_MULTISIG_ADDRESS, USDC_TOKEN, UNISWAP_V3_SHIT_POOL, BOND_AGGREGATOR_ADDRESS
forge script script/DeployAll.s.sol --rpc-url $RPC_URL --broadcast
```

Use `DeployShitFork.s.sol` to deploy only SHIT Protocol V3 fork components (assumes core tokens already deployed).

### Frontend

```bash
cd frontend
pnpm install
pnpm build              # Outputs to dist/
```

### Services

Each worker deploys independently via `npx wrangler deploy` from its own directory.

---

## Security

- **Multisig governance** — All privileged contract functions are gated by `MultisigGuard.onlyMultisig` (Safe multisig). No single-key admin access. 3-day timelock on multisig ownership transfer.
- **Reentrancy guards** on state-changing functions with token transfers
- **Pausable** on critical paths (staking, circuit breaker)
- **No hardcoded private keys** — all deployer keys read from environment variables
- **Frontend** — pnpm enforcement (npm/yarn blocked), Biome lint/format, Husky pre-commit hooks, lint-staged

---

## License

The entire SHIT Protocol codebase is licensed under **AGPL-3.0-only**. See [LICENSE](LICENSE) for the full text.

- **Smart contracts** (`contracts/`) — `SPDX-License-Identifier: AGPL-3.0-only` in every `.sol` and `.vy` file header.
- **Frontend** (`frontend/`) — `AGPL-3.0-only` in `package.json`, symlinked `LICENSE` file.
- **Services** (`services/`) — `AGPL-3.0-only` in each worker's `package.json`.
- **External dependencies** (`contracts/lib/`) — Third-party libraries retain their original licenses (MIT, Apache-2.0, GPL-3.0, BUSL). See `contracts/.gitmodules` for upstream URLs.
