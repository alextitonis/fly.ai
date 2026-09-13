"""
Market structure simulation: LBP, V1 migration, Folio index, convertible deposits,
and active POL management.

Models:
- LBPLauncher: Dutch auction initial price discovery
- shitV1Migrator: V1 to V2 token migration with initial distribution
- shitFolioDeployer / shitIndexVault: SHIT as index component (passive demand)
- shitConvertibleDepositFacility: Alternative SHIT minting via deposit auctions
- shitPOLManager / LiquidityMigrator / YieldRouter: Active POL management (cooldown + slippage cap)
- shitCoolerConfig: Bucky lending via Cooler loans (peg-support interest discount)

Contract sources:
- contracts/src/lbp/LBPLauncher.sol
- contracts/src/token/shitV1Migrator.sol
- contracts/src/index/shitFolioDeployer.sol
- contracts/src/index/shitIndexVault.sol
- contracts/src/deposits/shitConvertibleDepositFacility.sol
- contracts/src/pol/shitPOLManager.sol
- contracts/src/pol/LiquidityMigrator.sol
- contracts/src/pol/YieldRouter.sol
- contracts/src/lending/shitCoolerConfig.sol
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field

EPOCHS_PER_DAY = 3


@dataclass
class MarketStructureParams:
    # LBP (Liquidity Bootstrapping Pool)
    lbp_enabled: bool = True
    lbp_duration_days: int = 7
    lbp_start_price: float = 25.0
    lbp_end_price: float = 3.0
    lbp_tokens_sold: float = 200_000.0  # 20% of supply via LBP
    lbp_usdc_raised: float = 0.0  # Computed from sale

    # V1 Migration
    v1_migration_enabled: bool = True
    v1_tokens_to_migrate: float = 300_000.0  # 30% of supply from V1
    v1_migration_rate_per_epoch: float = 0.10  # 10% migrate per epoch
    v1_holder_sell_pressure: float = 0.15  # 15% of migrated tokens sold

    # Folio Index
    folio_enabled: bool = True
    folio_shit_weight_pct: float = 0.05  # 5% of index is SHIT
    folio_tvl: float = 10_000_000.0
    folio_rebalance_frequency: int = 9  # Every 3 days
    folio_growth_rate: float = 0.001  # Daily TVL growth

    # Convertible Deposit Facility
    cds_enabled: bool = True
    cds_deposit_frequency: float = 0.08  # Probability per epoch
    cds_avg_deposit_size: float = 50_000.0
    cds_discount_pct: float = 0.05  # 5% discount to NAV
    cds_shit_minted_total: float = 0.0
    cds_rate_limit_pct: float = 0.02  # Max 2% of supply per epoch (rate limit)
    cds_rate_limit_floor_pct: float = 0.005  # Reduced to 0.5% when price below floor
    cds_total_supply_cap_pct: float = 0.20  # Max 20% of total supply from CDS ever
    cds_dynamic_discount: bool = True  # Tighten discount when price below floor

    # Active POL management
    pol_migrations_enabled: bool = True
    pol_migration_frequency: float = 0.03  # Probability per epoch
    pol_migration_slippage_pct: float = 0.02  # 2% slippage per migration
    pol_gauge_staking_pct: float = 0.80  # 80% of POL staked to gauges
    pol_migration_cooldown_epochs: int = 3  # 1-day cooldown between migrations
    pol_migration_cap_pct: float = 0.20  # Max 20% of LP per migration (from contract)
    pol_max_slippage_pct: float = 0.05  # Max 5% slippage (from contract)

    # Cooler loans (Bucky lending)
    cooler_enabled: bool = True
    cooler_borrow_demand_per_epoch: float = 100_000.0  # Bucky borrowed per epoch
    cooler_interest_rate_apy: float = 0.08
    cooler_default_rate: float = 0.002  # Per-epoch default probability
    cooler_peg_support_enabled: bool = True  # Interest discount when price below floor
    cooler_peg_discount_bps: float = 50.0  # 0.5% discount per 1% below floor
    cooler_max_peg_discount_bps: float = 300.0  # Max 3% total discount

    initial_shit_supply: float = 1_000_000.0
    num_epochs: int = 90
    random_seed: int = 42


def simulate_market_structure(params: MarketStructureParams) -> pd.DataFrame:
    """Simulate LBP, V1 migration, Folio index, CDS, POL management, and Cooler loans."""
    rng = np.random.default_rng(params.random_seed)
    records = []

    shit_supply = params.initial_shit_supply
    shit_price = params.lbp_start_price if params.lbp_enabled else 10.0
    v1_remaining = params.v1_tokens_to_migrate if params.v1_migration_enabled else 0
    folio_tvl = params.folio_tvl
    cds_shit_minted = 0.0
    cds_usdc_raised = 0.0
    cooler_bucky_locked = 0.0
    cooler_total_interest = 0.0
    cooler_defaults = 0
    pol_migration_losses = 0.0
    last_pol_migration_epoch = -999  # Track cooldown
    lbp_usdc_raised = 0.0
    lbp_complete = False

    for epoch in range(params.num_epochs):
        day = epoch / EPOCHS_PER_DAY

        # ─── LBP Phase ───
        lbp_active = False
        if params.lbp_enabled and not lbp_complete:
            lbp_active = True
            lbp_progress = min(day / params.lbp_duration_days, 1.0)
            # Price descends from start to end
            shit_price = params.lbp_start_price * (1 - lbp_progress) + params.lbp_end_price * lbp_progress
            # Tokens sold linearly
            tokens_sold_epoch = params.lbp_tokens_sold / (params.lbp_duration_days * EPOCHS_PER_DAY)
            usdc_raised_epoch = tokens_sold_epoch * shit_price
            lbp_usdc_raised += usdc_raised_epoch
            shit_supply += tokens_sold_epoch

            if lbp_progress >= 1.0:
                lbp_complete = True
                lbp_active = False

        # ─── V1 Migration ───
        v1_migrated_epoch = 0.0
        v1_sell_pressure = 0.0
        if params.v1_migration_enabled and v1_remaining > 0:
            v1_migrated_epoch = min(v1_remaining * params.v1_migration_rate_per_epoch, v1_remaining)
            v1_remaining -= v1_migrated_epoch
            shit_supply += v1_migrated_epoch
            # Sell pressure from V1 holders
            v1_sell_pressure = v1_migrated_epoch * params.v1_holder_sell_pressure

        # ─── Folio Index ───
        folio_shit_demand = 0.0
        if params.folio_enabled:
            folio_tvl *= (1 + params.folio_growth_rate / EPOCHS_PER_DAY)
            # Rebalance: buy/sell SHIT to maintain weight
            if epoch % params.folio_rebalance_frequency == 0 and epoch > 0:
                current_shit_value = folio_tvl * params.folio_shit_weight_pct
                folio_shit_demand = current_shit_value / shit_price * 0.1  # 10% adjustment

        # ─── Convertible Deposit Facility (with dynamic rate limit + supply cap) ───
        cds_shit_epoch = 0.0
        cds_usdc_epoch = 0.0
        if params.cds_enabled and rng.random() < params.cds_deposit_frequency:
            deposit_size = params.cds_avg_deposit_size * rng.uniform(0.5, 3.0)
            nav_per_shit = 8.0  # Simplified
            # Dynamic discount: tighten when price below floor (less attractive)
            discount = params.cds_discount_pct
            if params.cds_dynamic_discount and shit_price < 6.0:
                discount = max(0.01, params.cds_discount_pct * (shit_price / 6.0))
            mint_price = nav_per_shit * (1 - discount)
            cds_shit_epoch = deposit_size / mint_price

            # Dynamic rate limit: reduced when price below floor
            effective_rate_limit = params.cds_rate_limit_pct
            if shit_price < 6.0:
                effective_rate_limit = params.cds_rate_limit_floor_pct

            # Total supply cap: CDS can never exceed X% of total supply
            remaining_cap = (shit_supply * params.cds_total_supply_cap_pct) - cds_shit_minted
            if remaining_cap <= 0:
                cds_shit_epoch = 0.0
            else:
                max_mint = min(shit_supply * effective_rate_limit, remaining_cap)
                if cds_shit_epoch > max_mint:
                    cds_shit_epoch = max_mint
                    deposit_size = cds_shit_epoch * mint_price

            if cds_shit_epoch > 0:
                cds_usdc_epoch = deposit_size
                cds_shit_minted += cds_shit_epoch
                cds_usdc_raised += cds_usdc_epoch
                shit_supply += cds_shit_epoch

        # ─── Active POL Management (with cooldown + slippage cap) ───
        pol_migration_loss = 0.0
        if params.pol_migrations_enabled and rng.random() < params.pol_migration_frequency:
            # Check cooldown
            if epoch - last_pol_migration_epoch >= params.pol_migration_cooldown_epochs:
                # Slippage capped at pol_max_slippage_pct
                effective_slippage = min(
                    params.pol_migration_slippage_pct * rng.uniform(0.5, 2.0),
                    params.pol_max_slippage_pct
                )
                # Migration capped at pol_migration_cap_pct of LP
                migration_size = 2_000_000 * params.pol_migration_cap_pct
                pol_migration_loss = migration_size * effective_slippage
                pol_migration_losses += pol_migration_loss
                last_pol_migration_epoch = epoch

        # ─── Cooler Loans (with peg-support interest discount) ───
        cooler_borrow_epoch = 0.0
        cooler_interest_epoch = 0.0
        cooler_default_epoch = False
        cooler_effective_rate = params.cooler_interest_rate_apy
        if params.cooler_enabled:
            # Peg-support: reduce interest rate when price below floor
            if params.cooler_peg_support_enabled and shit_price < 6.0:  # Simplified floor check
                deficit_pct = (6.0 - shit_price) / 6.0  # How far below floor
                discount_bps = min(
                    deficit_pct * 100 * params.cooler_peg_discount_bps,
                    params.cooler_max_peg_discount_bps
                )
                cooler_effective_rate = params.cooler_interest_rate_apy * (1 - discount_bps / 10000)
                # Lower rates increase borrow demand (peg support)
                demand_boost = 1 + (discount_bps / 10000) * 2  # Up to 60% more demand
            else:
                demand_boost = 1.0

            cooler_borrow_epoch = params.cooler_borrow_demand_per_epoch * rng.uniform(0.5, 1.5) * demand_boost
            cooler_bucky_locked += cooler_borrow_epoch
            cooler_interest_epoch = cooler_bucky_locked * cooler_effective_rate / 365 / EPOCHS_PER_DAY
            cooler_total_interest += cooler_interest_epoch

            if rng.random() < params.cooler_default_rate:
                cooler_defaults += 1
                default_loss = cooler_bucky_locked * 0.05  # 5% loss on default
                cooler_bucky_locked -= default_loss
                cooler_default_epoch = True

        # Price impact from sell pressure and buy demand
        net_flow = folio_shit_demand - v1_sell_pressure
        price_impact = net_flow * 0.0001  # Simplified price impact
        if not lbp_active:
            shit_price *= (1 + price_impact)
            shit_price = max(shit_price, 0.01)

        records.append({
            'epoch': epoch,
            'day': day,
            'shit_supply': shit_supply,
            'shit_price': shit_price,
            'lbp_active': lbp_active,
            'lbp_usdc_raised': lbp_usdc_raised,
            'lbp_complete': lbp_complete,
            'v1_remaining': v1_remaining,
            'v1_migrated_epoch': v1_migrated_epoch,
            'v1_sell_pressure': v1_sell_pressure,
            'folio_tvl': folio_tvl,
            'folio_shit_demand': folio_shit_demand,
            'cds_shit_minted': cds_shit_epoch,
            'cds_usdc_raised': cds_usdc_epoch,
            'cds_total_minted': cds_shit_minted,
            'cds_total_usdc': cds_usdc_raised,
            'pol_migration_loss': pol_migration_loss,
            'pol_total_migration_losses': pol_migration_losses,
            'cooler_bucky_locked': cooler_bucky_locked,
            'cooler_interest_epoch': cooler_interest_epoch,
            'cooler_total_interest': cooler_total_interest,
            'cooler_defaults': cooler_defaults,
            'cooler_effective_rate': cooler_effective_rate,
            'cooler_default_epoch': cooler_default_epoch,
        })

    return pd.DataFrame(records)


def market_structure_summary(df: pd.DataFrame) -> dict:
    return {
        'final_supply': df['shit_supply'].iloc[-1],
        'final_price': df['shit_price'].iloc[-1],
        'lbp_usdc_raised': df['lbp_usdc_raised'].iloc[-1],
        'v1_migrated': df['v1_remaining'].iloc[0] - df['v1_remaining'].iloc[-1] if len(df) > 0 else 0,
        'cds_total_minted': df['cds_total_minted'].iloc[-1],
        'cds_total_usdc': df['cds_total_usdc'].iloc[-1],
        'folio_final_tvl': df['folio_tvl'].iloc[-1],
        'pol_migration_losses': df['pol_total_migration_losses'].iloc[-1],
        'cooler_bucky_locked': df['cooler_bucky_locked'].iloc[-1],
        'cooler_total_interest': df['cooler_total_interest'].iloc[-1],
        'cooler_defaults': df['cooler_defaults'].iloc[-1],
    }
