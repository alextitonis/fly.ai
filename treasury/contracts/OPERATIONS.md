# SHIT Protocol — Production Deployment Runbook (Base Mainnet)

This runbook covers the full phased deployment of the SHIT Protocol SHIT fork on Base mainnet (chain ID 8453).

## Prerequisites

### 1. Environment Setup

```bash
cd contracts
cp .env.example .env
# Edit .env with real values:
#   PRIVATE_KEY            — deployer EOA private key
#   BASE_RPC_URL           — https://mainnet.base.org
#   SAFE_MULTISIG_ADDRESS  — Gnosis Safe address (must be created first)
#   BOND_AGGREGATOR_ADDRESS — 0x007A6621A9997A633Cb1B757f2f7ffb51310704A
#   AAVE_V3_POOL_ADDRESS   — 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
#   AZUSD_TOKEN            — AZUSD token address (must be deployed first)
```

### 2. Gnosis Safe

- Create a Safe multisig on Base mainnet (recommended: 3/5 threshold)
- Fund the deployer EOA with sufficient ETH for gas
- The deployer EOA will transfer all admin roles to the Safe at the end of deployment

### 3. External Dependencies

The following must exist on Base mainnet before Phase 2:

| Dependency | Address | Status |
|---|---|---|
| Bond Protocol Aggregator | `0x007A6621A9997A633Cb1B757f2f7ffb51310704A` | Deployed |
| Aave V3 Pool | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | Deployed |
| AZUSD Token | *(set in .env)* | Must be deployed first |
| Uniswap V3 SHIT Pool | *(created between phases)* | Created in Phase 1.5 |

### 4. Build & Test

```bash
forge build
forge test -vvv
```

---

## Phase 1: Core Tokens & Registries

**Script:** `DeployShitToken.s.sol`
**External dependencies:** None (no Uniswap pool, no Bond aggregator, no AZUSD)
**Risk:** Low — only deploys standalone ERC20 tokens and registry contracts

### Deploy

```bash
forge script script/DeployShitToken.s.sol \
    --rpc-url $BASE_RPC_URL \
    --broadcast \
    --verify \
    --etherscan-api-key $BASESCAN_API_KEY
```

### Contracts Deployed

| Contract | Purpose |
|---|---|
| `shitDeployer` | CREATE2 deployment utility |
| `ShitToken` (SHIT) | Main protocol token, 100M cap, multisig-gated minting |
| `Bucky` (BUCKY) | DSS-based stablecoin |
| `FixedRateProvider` | Fixed interest rate provider for PSM |
| `TokenRegistry` | Impact token whitelist registry |
| `TokenOnboardingManager` | Permissionless impact token onboarding |

### Post-Phase-1 Actions

1. **Record deployed addresses** — copy from script output into `.env`:
   ```
   SHIT_TOKEN_ADDRESS=0x...
   BUCKY_TOKEN_ADDRESS=0x...
   ```

2. **Verify contracts on Basescan** — the `--verify` flag handles this automatically if `BASESCAN_API_KEY` is set.

3. **Mint initial SHIT supply** (via Safe multisig):
   ```solidity
   // Call via Safe:
   ShitToken(SHIT_TOKEN_ADDRESS).mint(treasuryAddress, initialMintAmount);
   ```
   The initial mint should cover: LP seeding, team allocation, and treasury reserve.

---

## Phase 1.5: Uniswap V3 Pool Setup

**Must be completed before Phase 2.** The shitPriceFeed requires a Uniswap V3 pool with sufficient TWAP history.

### Steps

1. **Create Uniswap V3 pool** (SHIT/WETH or SHIT/USDC):
   - Use the Uniswap V3 Factory on Base: `0x33128a8FC3968f0411c4eB65bD3aA7e4F30e5F55`
   - Recommended fee tier: 0.3% (500) or 1% (10000) depending on expected volatility
   - Record the pool address and set `UNISWAP_V3_SHIT_POOL` in `.env`

2. **Seed initial liquidity**:
   - Provide sufficient liquidity to establish a market price
   - Minimum recommended: enough to make TWAP manipulation prohibitively expensive

3. **Increase observation cardinality** for TWAP:
   ```solidity
   // Call on the Uniswap V3 pool:
   IUniswapV3Pool(pool).increaseObservationCardinalityNext(1800);
   // 1800 observations = 30 minutes of 1-second granularity
   ```

4. **Wait for TWAP warmup**:
   - Wait at least 30 minutes (the `TWAP_PERIOD` used by `shitPriceFeed`)
   - The pool must have at least 2 observations before `getTwapPrice()` will work

---

## Phase 2: Kernel, Staking, Oracle, DSS & System Safety

**Script:** `DeployshitPhase2.s.sol`
**External dependencies:** SHIT token, Bucky token, AZUSD token, Uniswap V3 pool, Bond Protocol aggregator
**Risk:** High — deploys the full SHIT Protocol V3 Kernel system with staking, bonding, and stablecoin infrastructure

### Pre-Flight Checklist

- [ ] `SHIT_TOKEN_ADDRESS` set in `.env` (from Phase 1)
- [ ] `BUCKY_TOKEN_ADDRESS` set in `.env` (from Phase 1)
- [ ] `AZUSD_TOKEN` set in `.env`
- [ ] `UNISWAP_V3_SHIT_POOL` set in `.env` (from Phase 1.5)
- [ ] `BOND_AGGREGATOR_ADDRESS` set in `.env`
- [ ] `SAFE_MULTISIG_ADDRESS` set in `.env`
- [ ] Uniswap V3 pool has been seeded with liquidity
- [ ] TWAP warmup period (30 min) has elapsed
- [ ] `forge build` passes with no errors
- [ ] `forge test -vvv` passes

### Deploy

```bash
forge script script/DeployshitPhase2.s.sol \
    --rpc-url $BASE_RPC_URL \
    --broadcast \
    --verify \
    --etherscan-api-key $BASESCAN_API_KEY
```

### Contracts Deployed

| Contract | Purpose |
|---|---|
| `Kernel` | SHIT Protocol V3 Kernel — module/policy registry |
| `TreasuryValuation` | RFV/NAV oracle, implements `ITreasuryPolicy` |
| `shitPriceFeed` | Uniswap V3 TWAP price feed for SHIT |
| `ShitStaking` (stSHIT) | Rebasing staking contract with circuit breaker |
| `WstSHIT` | Non-rebasing stSHIT wrapper |
| `StakingAdapter` | Bridges ShitStaking to SHIT Protocol Heart |
| `shitInverseBond` | NAV-discount buyback that burns SHIT |
| `shitBondPricer` | Dynamic bond discount based on treasury growth |
| `Vat` | MakerDAO DSS core ledger |
| `Spotter` | DSS collateral price oracle |
| `Dog` | DSS liquidation module |
| `DaiJoin` | DSS adapter for Bucky token |
| `LinearDecrease` | DSS liquidation abacus |
| `ImpactOracleAdapter` | Impact token price oracle |
| `shitCollateralManager` | Multi-collateral onboarding for Bucky |
| `StablecoinPriceFeed` | Fixed $1 price feed for AZUSD |
| `shitCircuitBreaker` | Global Bucky depeg circuit breaker |
| `SHIT ProtocolRoles` | Kernel module — role management |
| `SHIT ProtocolMinter` | Kernel module — SHIT minting |
| `SHIT ProtocolTreasury` | Kernel module — reserve management |
| `shitPrice` | Kernel module — TWAP-based price oracle |
| `SHIT ProtocolRange` | Kernel module — RBS range bounds |
| `shitDistributor` | Bridges Heart beats to ShitStaking.rebase() |
| `SHIT ProtocolHeart` | Kernel policy — epoch heartbeat |
| `BondCallback` | Kernel policy — bond settlement |
| `Operator` | Kernel policy — RBS wall/cushion operator |
| `shitDefenseBudget` | Per-epoch treasury spending cap |
| `RolesAdmin` | Kernel policy — role administration |
| `Emergency` | Kernel policy — emergency shutdown |
| `TreasuryCustodian` | Kernel policy — treasury management |

### Chain-ID Guards

On Base mainnet (chain ID 8453), the script enforces:
- `UNISWAP_V3_SHIT_POOL` must be non-zero (no testnet fallback)
- `BOND_AGGREGATOR_ADDRESS` must be non-zero (defaults to `0x007A...0704A`)

On testnets, both fall back to `msg.sender` for local testing.

---

## Post-Deployment Configuration

### Critical — Must Be Done via Safe Multisig

1. **Set authorized minter on ShitToken** (if not done in script):
   ```solidity
   ShitToken(SHIT_TOKEN_ADDRESS).setAuthorizedMinter(SHIT ProtocolMinter_address);
   ```

2. **Pull RolesAdmin admin** (if not done in script):
   ```solidity
   RolesAdmin(rolesAdmin_address).pullNewAdmin();
   ```

3. **Set treasury valuations** — initial RFV/NAV/floorPrice:
   ```solidity
   TreasuryValuation(treasuryValuation_address).setValuations(
       rfv,           // Risk-free value in 1e18
       nav,           // Net asset value in 1e18
       shitSupply    // Current SHIT total supply
   );
   ```
   This sets the floor price that gates supplemental emissions in ShitStaking.

4. **Register treasury assets** in TreasuryValuation:
   ```solidity
   TreasuryValuation(treasuryValuation_address).registerAsset(
       tokenAddress,
       AssetType.ERC20,      // or ERC4626, LP_TOKEN, MANUAL
       priceFeedAddress,
       haircutBps             // e.g. 8000 = 80% of NAV for RFV
   );
   ```

5. **Initialize shitPrice** with start observations:
   - The Heart must beat to populate the moving average
   - First beat: call `SHIT ProtocolHeart(heart_address).beat()`
   - Or initialize manually via `shitPrice(shitPrice_address).initialize(startObservations, lastObservationTime)`

6. **Add impact token oracles**:
   ```solidity
   ImpactOracleAdapter(impactOracle_address).addToken(
       tokenAddress,
       uniswapPoolAddress,
       tokenIsToken1   // bool
   );
   ```

7. **Onboard additional collateral types** for Bucky (beyond AZUSD):
   ```solidity
   shitCollateralManager(collateralManager_address).addCollateral(
       tokenAddress,
       priceFeedAddress,
       liquidationRatio,    // e.g. 1.5e27 = 150%
       debtCeiling,         // in rad (1e45 = 1 token)
       isStablecoin         // false for volatile collateral
   );
   ```

8. **Create Bond Protocol markets** for RBS:
   - Use the Bond Protocol Teller/SDA contracts to create markets
   - The Operator will interact with these markets for wall/cushion operations

9. **Verify Safe ownership and threshold**:
   - Confirm all contracts have `multisig` set to the Safe address
   - Confirm Kernel executor is the Safe address
   - Confirm RolesAdmin admin is the Safe address
   - Confirm TokenRegistry admin is the Safe address

### Recommended — Operational Setup

10. **Set up Gelato keepers** for automated operations:

    The protocol uses two permissionless keeper functions, automated via [Gelato Automate](https://gelato.network/automate):

    | Task | Function | Interval | Purpose |
    |---|---|---|---|
    | Heart beat | `SHIT ProtocolHeart.beat()` | Every 4h | Price update, rebase, RBS operate, reward minting |
    | Circuit breaker check | `shitCircuitBreaker.check()` | Every 8h | Bucky peg monitoring, auto-trip on depeg |

    Both functions are **fully permissionless** — anyone can call them. Gelato is the automated caller.

    **Setup:**
    ```bash
    # Install dependencies
    npm install

    # Set env vars (in .env):
    #   GELATO_API_KEY=...
    #   KEEPER_PRIVATE_KEY=...     # EOA key for Gelato keeper (funded via 1Balance)
    #   HEART_ADDRESS=0x...        # from Phase 2 deployment output
    #   CIRCUIT_BREAKER_ADDRESS=0x...  # from Phase 2 deployment output

    # Create Gelato tasks
    npm run setup-gelato
    ```

    **Fund the keeper:** Deposit ETH into [Gelato 1Balance](https://1balance.gelato.network/) for the keeper EOA address. This pays for gas on all automated transactions.

    **Monitor:** View task status at [app.gelato.network](https://app.gelato.network/).

11. **Price feed infrastructure:**

    | Feed | Source | Contract | Switchable? |
    |---|---|---|---|
    | SHIT/Reserve (RBS) | Uniswap V3 TWAP (30 min) | `shitPriceFeed` → `shitPrice` | Yes — `setPool()` on `shitPriceFeed`, `setTwapPriceFeed()` on `shitPrice` (multisig) |
    | Bucky peg | `ImpactOracleAdapter` (per-token TWAP) | `shitCircuitBreaker` reads `ImpactOracleAdapter.getTokenPrice(bucky)` | Yes — `setPriceFeed()` on `shitCircuitBreaker` (multisig) |
    | AZUSD (DSS collateral) | `StablecoinPriceFeed` (fixed $1) | `shitCollateralManager` | N/A — fixed |
    | Impact tokens (DSS) | Per-token Uniswap V3 TWAP | `ImpactOracleAdapter` | Yes — `addToken()` / `removeToken()` (multisig) |

    To switch the SHIT price feed pool (e.g., from SHIT/AZUSD to SHIT/Bucky):
    ```solidity
    // Via Safe multisig:
    shitPriceFeed(priceFeed_address).setPool(newUniswapPool);
    shitPrice(shitPrice_address).setTwapPriceFeed(newPriceFeedAddress);
    // Then re-initialize shitPrice with start observations via Heart beat
    ```

12. **Bond duration management:**

    Cushion bond market duration is adjustable by the multisig:
    ```solidity
    // Via Safe multisig — set duration to 5 days:
    Operator(operator_address).setCushionParams(
        5 days,       // cushionDuration (1-7 days recommended)
        15000,        // cushionDebtBuffer (150 = 1.5x)
        12 hours      // cushionDepositInterval
    );
    ```

13. **Inverse bond management:**

    The `shitInverseBond` contract has a runtime-switchable payout token:
    ```solidity
    // Via Safe multisig — switch payout from AZUSD to Bucky:
    shitInverseBond(inverseBond_address).setPayoutToken(buckyTokenAddress);

    // Update NAV and liquid treasury value (sets per-epoch capacity):
    shitInverseBond(inverseBond_address).updateNav(navPershit, liquidTreasuryValue);
    ```

    Capacity = `liquidTreasuryValue × 1%` per 8-hour epoch. Spread is hardcoded at 1.5%.

14. **shitBondPricer (advisory only):**

    `shitBondPricer` computes a recommended bond discount based on treasury backing ratio. It is **not wired into the Operator** — the multisig references it when manually adjusting spreads:
    ```solidity
    // Read the recommended discount:
    shitBondPricer(bondPricer_address).recommendedDiscount();
    // Then manually set spreads on Operator if adjustment is warranted
    ```

---

## Future Reserve Migration (AZUSD → Bucky)

When Bucky is ready to replace AZUSD as the RBS reserve token, use the migration script:

```bash
forge script script/MigrateReserve.s.sol \
    --rpc-url $BASE_RPC_URL \
    --broadcast \
    --verify \
    --etherscan-api-key $BASESCAN_API_KEY
```

**What the script does:**
1. Deploys new `shitPriceFeed` pointing to SHIT/Bucky Uniswap V3 pool
2. Deploys new `shitPrice` module with the new price feed
3. Deploys new `SHIT ProtocolRange` with Bucky as reserve
4. Deploys new `BondCallback` for the new reserve
5. Deploys new `Operator` with Bucky as reserve
6. Deploys new `shitDefenseBudget` wrapping the new Operator
7. Installs new modules in Kernel (replaces old PRICE and RANGE)
8. Activates new policies
9. Registers new DefenseBudget on Heart

**Post-migration (via Safe multisig):**
- Initialize new shitPrice with start observations
- Set cushion params, spreads, regen params on new Operator
- Update `shitInverseBond.setPayoutToken(buckyTokenAddr)`
- Deactivate old Operator, BondCallback, DefenseBudget
- Update Gelato tasks if any addresses changed

**What doesn't need migration:**
- `shitInverseBond` — payout token is runtime-switchable via `setPayoutToken()`
- `shitCircuitBreaker` — already monitors Bucky via `ImpactOracleAdapter`
- `ShitStaking` — not reserve-specific
- `TreasuryValuation` — not reserve-specific

---

## Emergency Procedures

- `Emergency.shutdown()` — stops all Kernel operations
- `ShitStaking.pause()` — stops staking/unstaking/rebasing
- `shitCircuitBreaker.trip()` — manually trip circuit breaker
- `TreasuryValuation.setRfvBypass(true)` — emergency RFV bypass

---

## Verification

### Contract Verification

All scripts support `--verify` with `BASESCAN_API_KEY`:

```bash
forge script script/DeployShitToken.s.sol \
    --rpc-url $BASE_RPC_URL \
    --broadcast \
    --verify \
    --etherscan-api-key $BASESCAN_API_KEY
```

### Manual Verification

After deployment, verify on [Basescan](https://basescan.org):
1. Each contract is verified (source code matches)
2. Constructor arguments match expected values
3. `multisig` / admin roles point to the Safe address
4. No unexpected admin roles remain on the deployer EOA

### Post-Deployment Checks

```bash
# Verify all contracts compiled
forge build

# Run full test suite
forge test -vvv

# Check deployment addresses match script output
# (manual comparison with Basescan)
```

---

## Alternative: Unified Deployment

If you prefer a single-script deployment (no phased approach), use `DeployAll.s.sol`:

```bash
forge script script/DeployAll.s.sol \
    --rpc-url $BASE_RPC_URL \
    --broadcast \
    --verify \
    --etherscan-api-key $BASESCAN_API_KEY
```

This deploys everything in one transaction sequence. The same chain-id guards apply on Base mainnet.

**Note:** The phased approach is recommended for production as it allows:
- Verifying core tokens before deploying dependent contracts
- Setting up the Uniswap V3 pool between phases
- Reducing risk of a single point of failure in deployment

---

## Contract Addresses Summary

After full deployment, record all addresses in a secure location:

```
# Phase 1
SHIT_TOKEN_ADDRESS=0x...
BUCKY_TOKEN_ADDRESS=0x...
SHIT_DEPLOYER_ADDRESS=0x...
TOKEN_REGISTRY_ADDRESS=0x...
TOKEN_ONBOARDING_MANAGER_ADDRESS=0x...
FIXED_RATE_PROVIDER_ADDRESS=0x...

# Phase 2
KERNEL_ADDRESS=0x...
TREASURY_VALUATION_ADDRESS=0x...
SHIT_PRICE_FEED_ADDRESS=0x...
SHIT_STAKING_ADDRESS=0x...
WSTSHIT_ADDRESS=0x...
STAKING_ADAPTER_ADDRESS=0x...
SHIT_INVERSE_BOND_ADDRESS=0x...
SHIT_BOND_PRICER_ADDRESS=0x...
VAT_ADDRESS=0x...
SPOTTER_ADDRESS=0x...
DOG_ADDRESS=0x...
DAI_JOIN_ADDRESS=0x...
LINEAR_DECREASE_ADDRESS=0x...
IMPACT_ORACLE_ADAPTER_ADDRESS=0x...
SHIT_COLLATERAL_MANAGER_ADDRESS=0x...
STABLECOIN_PRICE_FEED_ADDRESS=0x...
SHIT_CIRCUIT_BREAKER_ADDRESS=0x...
SHIT_ROLES_ADDRESS=0x...
SHIT_MINTER_ADDRESS=0x...
SHIT_TREASURY_ADDRESS=0x...
SHIT_PRICE_ADDRESS=0x...
SHIT_RANGE_ADDRESS=0x...
SHIT_DISTRIBUTOR_ADDRESS=0x...
SHIT_HEART_ADDRESS=0x...
BOND_CALLBACK_ADDRESS=0x...
OPERATOR_ADDRESS=0x...
SHIT_DEFENSE_BUDGET_ADDRESS=0x...
ROLES_ADMIN_ADDRESS=0x...
EMERGENCY_ADDRESS=0x...
TREASURY_CUSTODIAN_ADDRESS=0x...

# External
UNISWAP_V3_SHIT_POOL=0x...
BOND_AGGREGATOR_ADDRESS=0x007A6621A9997A633Cb1B757f2f7ffb51310704A
AAVE_V3_POOL_ADDRESS=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
SAFE_MULTISIG_ADDRESS=0x...
```

---

## Security Notes

- **Never hardcode private keys** in scripts or `.env` committed to git
- **Always verify** the Safe multisig address before deployment
- **Test on Base Sepolia** first (chain ID 84532) before mainnet
- **Use hardware wallet** for the deployer EOA on mainnet
- **Time-sensitive operations**: TWAP warmup (30 min), MultisigGuard timelock (3 days), staking param timelock (2 days)
- **Circuit breaker grace period**: 7 days post-deployment, the staking circuit breaker is disabled
