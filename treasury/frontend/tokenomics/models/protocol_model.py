"""
Integrated Protocol Model for SHIT Protocol

Combines all sub-models into a unified simulation with cross-module interactions.

Sub-models:
- Staking (rebasing, circuit breaker, supplemental emissions)
- Treasury (RFV/NAV, haircuts, yield, team comp, dissolution)
- Floor hook (monotone floor, redemptions, swap routing)
- Bonding (standard, inverse, premium seller)
- Stablecoin (Bucky PSM, PegKeeper, RBS, AMOs)
- Fee routing (FeeSplitter, FeeDecaySplitter, Burner)
- BAMM + Perps (LP leverage, perp vault, funding, liquidations)
- Yield revenue (meta-vaults, bribes, Pendle, AMO detail)
- Governance ops (Governor, Gelato, token registry, deployment config)
- Market structure (LBP, V1 migration, Folio index, CDS, POL, Cooler)

Cross-module interactions:
- Treasury RFV → staking (supplemental emission gating)
- Floor hook supply updates → treasury
- Premium seller mints → supply → floor hook → treasury
- Bucky AMO profits → treasury USDC → RFV
- RBS operations → price → staking circuit breaker
- Fee routing → treasury + staking yield
- BAMM yield → treasury
- Bribes → staking yield + treasury
- Perp liquidations → Bucky demand → peg
- Gelato outage → premium seller + PegKeeper + liquidations stop
- Governance → parameter changes → all modules
- LBP → initial price discovery
- V1 migration → supply distribution + sell pressure
- CDS → alternative minting → supply
- Burner → deflationary pressure
- Cooler loans → Bucky demand → peg support
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional
from models.staking_model import StakingParams, StakingState, BPS_DENOMINATOR, EPOCHS_PER_DAY
from models.treasury_model import TreasuryParams, TreasuryState, compute_rfv_nav, enforce_rfv_invariant, BPS
from models.floor_hook_model import FloorHookParams, FloorHookState, compute_floor
from models.bonding_model import BondingParams, BondingState, BASIS_POINTS
from models.stablecoin_model import StablecoinParams, StablecoinState
from models.fee_routing_model import FeeRoutingParams, FeeRoutingState, compute_mgmt_bps
from models.bamm_perp_model import BAMMParams, BAMMState
from models.yield_revenue_model import YieldRevenueParams
from models.governance_ops_model import GovernanceParams, GovernanceState
from models.market_structure_model import MarketStructureParams


@dataclass
class ProtocolParams:
    """Unified parameters for the integrated protocol model."""
    # Core sub-model params
    staking: StakingParams = field(default_factory=StakingParams)
    treasury: TreasuryParams = field(default_factory=TreasuryParams)
    floor_hook: FloorHookParams = field(default_factory=FloorHookParams)
    bonding: BondingParams = field(default_factory=BondingParams)
    stablecoin: StablecoinParams = field(default_factory=StablecoinParams)

    # New sub-model params
    fee_routing: FeeRoutingParams = field(default_factory=FeeRoutingParams)
    bamm_perp: BAMMParams = field(default_factory=BAMMParams)
    yield_revenue: YieldRevenueParams = field(default_factory=YieldRevenueParams)
    governance: GovernanceParams = field(default_factory=GovernanceParams)
    market_structure: MarketStructureParams = field(default_factory=MarketStructureParams)

    # Simulation
    num_epochs: int = 90
    random_seed: Optional[int] = 42

    # Quote token — 'USDC' initially, switchable to 'Bucky' after Bucky launch
    # All dollar-denominated reserves (treasury, floor hook, bonding) use this token
    quote_token: str = "USDC"

    # Cross-module: how much Bucky AMO yield flows to treasury
    amo_yield_to_treasury_pct: float = 1.0

    # Cross-module: how premium seller proceeds flow to treasury
    premium_proceeds_to_treasury_pct: float = 1.0

    # Cross-module: fee routing to staking yield
    fee_to_staking_yield_pct: float = 1.0  # Staking fees boost staking APY

    # Cross-module: bribe yield to stakers
    bribe_to_stakers_pct: float = 0.90

    # Cross-module: burner deflationary impact
    burner_enabled: bool = True


def simulate_protocol(params: ProtocolParams) -> pd.DataFrame:
    """
    Run integrated protocol simulation.
    All sub-models share state and interact at each epoch.
    """
    rng = np.random.default_rng(params.random_seed)

    # Initialize sub-model states
    staking = StakingState(
        shit_supply=params.staking.initial_shit_supply,
        st_shit_supply=params.staking.initial_shit_supply * params.staking.initial_staking_ratio,
        staking_index=params.staking.initial_staking_index,
        staking_ratio=params.staking.initial_staking_ratio,
        twap_price=params.staking.initial_price,
        nav_per_shit=params.staking.initial_nav_per_shit,
        floor_price=params.staking.initial_floor_price,
        rfv=params.staking.initial_floor_price * params.staking.initial_shit_supply,
    )

    treasury = TreasuryState(
        usdc_balance=params.treasury.initial_usdc,
        morpho_position=params.treasury.initial_morpho,
        impact_token_value=params.treasury.initial_impact_tokens,
        pol_value=params.treasury.initial_pol,
        shit_supply=params.staking.initial_shit_supply,
    )

    floor_hook = FloorHookState(
        total_shit_supply=params.staking.initial_shit_supply,
        floor_reserve=params.floor_hook.initial_floor_reserve,
        band_reserve=params.floor_hook.initial_band_reserve,
        hook_shit_balance=params.floor_hook.initial_hook_shit,
        pool_shit=params.floor_hook.initial_pool_shit,
        pool_usdc=params.floor_hook.initial_pool_usdc,
    )

    bonding = BondingState(
        shit_supply=params.staking.initial_shit_supply,
        twap_price=params.staking.initial_price,
        nav_per_shit=params.staking.initial_nav_per_shit,
        pool_shit=params.floor_hook.initial_pool_shit,
        pool_usdc=params.floor_hook.initial_pool_usdc,
        treasury_usdc=params.treasury.initial_usdc,
    )

    stablecoin = StablecoinState(
        bucky_supply=params.stablecoin.initial_bucky_supply,
        psm_usdc=params.stablecoin.initial_psm_usdc,
        peg_price=params.stablecoin.initial_price,
        target_price=params.stablecoin.initial_target,
        ma_target=params.stablecoin.initial_target,
        lending_amo_position=params.stablecoin.initial_bucky_supply * params.stablecoin.lending_amo_pct,
        liquidity_amo_position=params.stablecoin.initial_bucky_supply * params.stablecoin.liquidity_amo_pct,
        treasury_usdc=0.0,
        bid_counter=[0] * params.stablecoin.reinstate_window,
        ask_counter=[0] * params.stablecoin.reinstate_window,
    )

    # Initialize new sub-model states
    fee_routing = FeeRoutingState()
    bamm = BAMMState(
        lp_tvl=params.bamm_perp.initial_lp_tvl,
        perp_tvl=params.bamm_perp.initial_perp_tvl,
        funding_rate=params.bamm_perp.funding_rate_factor,
    )
    bamm.liquidation_history = []
    governance = GovernanceState()

    # Market structure state
    ms_v1_remaining = params.market_structure.v1_tokens_to_migrate if params.market_structure.v1_migration_enabled else 0
    ms_folio_tvl = params.market_structure.folio_tvl
    ms_cds_minted = 0.0
    ms_cds_usdc = 0.0
    ms_cooler_bucky_locked = 0.0
    ms_cooler_interest = 0.0
    ms_lbp_complete = not params.market_structure.lbp_enabled
    ms_lbp_usdc = 0.0
    ms_lbp_tokens_minted = 0.0
    ms_v1_minted = 0.0
    ms_pol_migration_losses = 0.0
    ms_last_pol_migration = -999
    ms_shit_burned = 0.0

    # Check deployment config
    if not params.governance.authorized_minter_set:
        governance.config_errors += 1
    if not params.governance.usdc_address_correct:
        governance.config_errors += 1
    if not params.governance.shit_token_set:
        governance.config_errors += 1

    # Initialize derived values
    treasury.rfv, treasury.nav = compute_rfv_nav(
        treasury.usdc_balance, treasury.morpho_position,
        treasury.impact_token_value, treasury.pol_value, params.treasury
    )
    treasury.floor_price = treasury.rfv / treasury.shit_supply if treasury.shit_supply > 0 else 0
    treasury.nav_per_shit = treasury.nav / treasury.shit_supply if treasury.shit_supply > 0 else 0
    floor_hook.floor_price = compute_floor(floor_hook)

    # Convert APYs to per-epoch
    epy = 3 * 365
    morpho_rate = (1 + params.treasury.morpho_apy) ** (1 / epy) - 1
    impact_rate = (1 + params.treasury.impact_token_apy) ** (1 / epy) - 1
    pol_rate = (1 + params.treasury.pol_fee_apy) ** (1 / epy) - 1
    usdc_rate = (1 + params.treasury.usdc_apy) ** (1 / epy) - 1
    lending_rate = (1 + params.stablecoin.lending_apy) ** (1 / epy) - 1
    liquidity_rate = (1 + params.stablecoin.liquidity_fee_apy) ** (1 / epy) - 1
    team_comp_per_epoch = params.treasury.team_comp_rate_bps / BPS / epy

    price_history = [stablecoin.peg_price] * params.stablecoin.target_ma_days * 3

    records = []

    for epoch in range(params.num_epochs):
        # ─── 1. PRICE UPDATE (shared) ───
        # Pool price from floor hook (AMM) — this is the real market price
        pool_market_price = floor_hook.pool_usdc / floor_hook.pool_shit if floor_hook.pool_shit > 0 else staking.twap_price
        shit_returns = rng.normal(params.staking.price_drift, params.staking.price_volatility)
        staking.twap_price *= (1 + shit_returns)
        # Blend TWAP with pool price (70% random walk, 30% pool) — pool is the real price discovery
        staking.twap_price = staking.twap_price * 0.7 + pool_market_price * 0.3

        # Mean-reversion: floor hook absorbs sells, inverse bond provides buyback
        # This pulls price toward NAV over time (natural buy support from protocol mechanics)
        if staking.nav_per_shit > 0:
            gap = staking.nav_per_shit - staking.twap_price
            staking.twap_price += gap * params.staking.price_mean_reversion_strength

        staking.twap_price = max(staking.twap_price, 0.01)
        bonding.twap_price = staking.twap_price

        # Stablecoin peg (separate price dynamics)
        bucky_returns = rng.normal(params.stablecoin.price_drift, params.stablecoin.price_volatility)
        stablecoin.peg_price *= (1 + bucky_returns)
        stablecoin.peg_price = max(stablecoin.peg_price, 0.5)
        price_history.append(stablecoin.peg_price)

        # ─── 2. TREASURY: accrue yield ───
        morpho_yield = treasury.morpho_position * morpho_rate
        impact_yield = treasury.impact_token_value * impact_rate
        pol_yield = treasury.pol_value * pol_rate
        usdc_yield = treasury.usdc_balance * usdc_rate

        treasury.morpho_position += morpho_yield
        treasury.impact_token_value += impact_yield
        treasury.pol_value += pol_yield
        treasury.usdc_balance += usdc_yield + pol_yield
        treasury.pol_value -= pol_yield

        # Bucky AMO yield → treasury
        amo_yield = (stablecoin.lending_amo_position * lending_rate +
                     stablecoin.liquidity_amo_position * liquidity_rate)
        treasury.usdc_balance += amo_yield * params.amo_yield_to_treasury_pct
        stablecoin.treasury_usdc += amo_yield
        stablecoin.total_amo_yield += amo_yield

        # ─── 2b. FEE ROUTING: FeeSplitter + FeeDecaySplitter ───
        # Fees scale with protocol activity — base fee grows as treasury and pool liquidity grow
        pool_tvl = floor_hook.pool_usdc + floor_hook.pool_shit * staking.twap_price
        activity_multiplier = 1.0 + min(pool_tvl / 2_000_000.0, 10.0)  # Scales up to 11x as pool grows
        effective_swap_fees = params.fee_routing.daily_swap_fee_usdc * activity_multiplier / EPOCHS_PER_DAY
        treasury_from_fees = effective_swap_fees * params.fee_routing.treasury_ratio_bps / 10000
        staking_from_fees = effective_swap_fees * params.fee_routing.staking_ratio_bps / 10000
        treasury.usdc_balance += treasury_from_fees
        fee_routing.treasury_fee_accumulated += treasury_from_fees
        fee_routing.staking_fee_accumulated += staking_from_fees

        # FeeDecaySplitter: hook fees with management decay
        effective_hook_fees = params.fee_routing.daily_hook_fee_usdc * activity_multiplier / EPOCHS_PER_DAY
        decay_pool = effective_hook_fees * params.fee_routing.total_fee_bps / 10000
        mgmt_bps = compute_mgmt_bps(epoch, params.fee_routing)
        mgmt_amount = decay_pool * mgmt_bps / params.fee_routing.total_fee_bps
        treasury_decay = decay_pool * (params.fee_routing.total_fee_bps - mgmt_bps) / params.fee_routing.total_fee_bps
        direct_treasury = effective_hook_fees - decay_pool
        treasury.usdc_balance += treasury_decay + direct_treasury
        fee_routing.management_fee_accumulated += mgmt_amount
        fee_routing.treasury_fee_accumulated += treasury_decay + direct_treasury

        # ─── 2c. BAMM YIELD → 50% treasury, 50% floor reserve ───
        # Organic LP growth: LPs deposit as treasury grows and trading activity increases
        organic_lp_growth = treasury.usdc_balance * 0.001 + effective_swap_fees * 0.1
        bamm.lp_tvl += organic_lp_growth
        bamm.lp_tvl += bamm.lp_tvl * 0.20 / 365 / EPOCHS_PER_DAY  # LP fee yield
        # Perp TVL grows with Bucky supply
        if stablecoin.bucky_supply > 0:
            bamm.perp_tvl = max(bamm.perp_tvl, stablecoin.bucky_supply * 0.15)
        bamm.bamm_borrowed = bamm.lp_tvl * params.bamm_perp.bamm_utilization_rate
        bamm_yield = bamm.bamm_borrowed * params.bamm_perp.bamm_borrow_rate_apy / 365 / EPOCHS_PER_DAY
        bamm.bamm_yield_accumulated += bamm_yield
        bamm_treasury = bamm_yield * params.bamm_perp.bamm_yield_to_treasury_pct * 0.50
        bamm_to_floor = bamm_yield * params.bamm_perp.bamm_yield_to_treasury_pct * 0.50
        treasury.usdc_balance += bamm_treasury
        floor_hook.floor_reserve += bamm_to_floor
        bamm.treasury_from_bamm += bamm_treasury

        # ─── 2d. BRIBES → staking yield + treasury ───
        # Organic POL growth: treasury deploys to POL as it grows
        organic_pol = treasury.usdc_balance * 0.002
        # Update pol_for_bribes dynamically based on treasury growth
        effective_pol_for_bribes = max(params.yield_revenue.pol_for_bribes, organic_pol * 50)
        bribe_rate = params.yield_revenue.base_bribe_apy * (1 + rng.normal(0, params.yield_revenue.bribe_volatility) * 0.1)
        bribe_rate = max(bribe_rate, 0.0)
        epoch_bribes = effective_pol_for_bribes * bribe_rate / 365 / EPOCHS_PER_DAY
        staker_bribes = epoch_bribes * params.bribe_to_stakers_pct
        treasury_bribes = epoch_bribes * (1 - params.bribe_to_stakers_pct)
        treasury.usdc_balance += treasury_bribes

        # Team comp
        if params.treasury.team_comp_active:
            total_t = treasury.usdc_balance + treasury.morpho_position + treasury.impact_token_value + treasury.pol_value
            comp = min(total_t * team_comp_per_epoch, total_t * params.treasury.team_comp_max_bps / BPS / epy)
            treasury.usdc_balance -= comp
            treasury.team_comp_accumulated += comp

        # ─── 3. TREASURY: recompute RFV/NAV ───
        treasury.rfv, treasury.nav = compute_rfv_nav(
            treasury.usdc_balance, treasury.morpho_position,
            treasury.impact_token_value, treasury.pol_value, params.treasury
        )
        raw_floor = treasury.rfv / treasury.shit_supply if treasury.shit_supply > 0 else 0
        # Monotone floor: never decreases below historical max
        if not hasattr(treasury, 'max_floor_price'):
            treasury.max_floor_price = 0.0
        treasury.max_floor_price = max(treasury.max_floor_price, raw_floor)
        treasury.floor_price = treasury.max_floor_price
        treasury.nav_per_shit = treasury.nav / treasury.shit_supply if treasury.shit_supply > 0 else 0
        staking.nav_per_shit = treasury.nav_per_shit
        staking.floor_price = treasury.floor_price
        staking.rfv = treasury.rfv

        # ─── 4. FLOOR HOOK: process swaps ───
        prev_shit_absorbed = floor_hook.total_shit_absorbed
        buy_vol = max(0, rng.normal(params.floor_hook.base_buy_volume_usdc,
                                     params.floor_hook.base_buy_volume_usdc * params.floor_hook.volume_volatility))
        if buy_vol > 0 and floor_hook.pool_shit > 0:
            k = floor_hook.pool_shit * floor_hook.pool_usdc
            new_usdc = floor_hook.pool_usdc + buy_vol
            new_shit = k / new_usdc
            shit_bought = floor_hook.pool_shit - new_shit
            # Pool swap fee (0.3%)
            swap_fee = buy_vol * params.floor_hook.swap_fee_bps / BASIS_POINTS
            # Hook buy fee (1%) → floor reserve directly
            buy_fee = buy_vol * params.floor_hook.buy_fee_bps / BASIS_POINTS
            net = buy_vol - swap_fee - buy_fee
            floor_hook.floor_reserve += net * params.floor_hook.floor_reserve_bps / BASIS_POINTS + swap_fee * params.fee_routing.total_fee_bps / BASIS_POINTS + buy_fee
            floor_hook.band_reserve += net * params.floor_hook.band_reserve_bps / BASIS_POINTS
            floor_hook.pool_usdc = new_usdc
            floor_hook.pool_shit = new_shit
            # SHIT bought from pool re-enter circulation — reduce hook balance
            if floor_hook.hook_shit_balance > 0:
                released = min(shit_bought, floor_hook.hook_shit_balance)
                floor_hook.hook_shit_balance -= released

        sell_vol = max(0, rng.normal(params.floor_hook.base_sell_volume_shit,
                                      params.floor_hook.base_sell_volume_shit * params.floor_hook.volume_volatility))
        # Cap sell volume to available circulating supply (can't sell more SHIT than exist)
        circulating = floor_hook.total_shit_supply - floor_hook.hook_shit_balance
        sell_vol = min(sell_vol, max(0, circulating * 0.02))  # Max 2% of circulating per epoch
        if sell_vol > 0 and floor_hook.pool_usdc > 0:
            k = floor_hook.pool_shit * floor_hook.pool_usdc
            new_shit = floor_hook.pool_shit + sell_vol
            new_usdc = k / new_shit
            usdc_out = floor_hook.pool_usdc - new_usdc
            floor_hook.pool_shit = new_shit
            floor_hook.pool_usdc = new_usdc
            # Dynamic hook sell fee: reduces USDC output to seller, fee → floor reserve
            # P/F < 0.3 → 10%, P/F < 0.5 → 6%, P/F < 0.8 → 3%, else 1%
            pool_price_now = floor_hook.pool_usdc / floor_hook.pool_shit if floor_hook.pool_shit > 0 else 0
            pf_ratio = pool_price_now / floor_hook.floor_price if floor_hook.floor_price > 0 else 1.0
            if pf_ratio < 0.3:
                dynamic_sell_fee_bps = 1000  # 10% critical
            elif pf_ratio < 0.5:
                dynamic_sell_fee_bps = 600  # 6% stress
            elif pf_ratio < 0.8:
                dynamic_sell_fee_bps = 300  # 3% elevated
            else:
                dynamic_sell_fee_bps = 100  # 1% base
            # Sell fee takes portion of USDC output → floor reserve (no phantom SHIT)
            sell_fee_usdc = usdc_out * dynamic_sell_fee_bps / BASIS_POINTS
            floor_hook.floor_reserve += sell_fee_usdc
            # Only the actual sell_vol SHIT are absorbed by the hook
            floor_hook.hook_shit_balance += sell_vol
            floor_hook.total_shit_absorbed += sell_vol

        floor_hook.total_shit_supply = treasury.shit_supply
        hook_computed_floor = compute_floor(floor_hook)
        # Redemption floor = hook's own reserve-backed floor (what it can actually pay out)
        floor_hook.reserve_floor = hook_computed_floor
        # Displayed floor = (hook reserves + asset valuation + treasury RFV) / supply
        # ADDITIVE — total combined backing, no double counting.
        # When treasury deposits assets to hook, they leave treasury RFV and enter asset_valuation.
        asset_val = getattr(floor_hook, 'asset_valuation', 0)
        total_backing = floor_hook.floor_reserve + asset_val + treasury.rfv
        floor_hook.floor_price = total_backing / floor_hook.redeemable_supply if floor_hook.redeemable_supply > 0 else 0
        # Enforce monotone floor
        if floor_hook.floor_price < floor_hook.max_floor_price:
            floor_hook.floor_price = floor_hook.max_floor_price
        floor_hook.redeemable_supply = floor_hook.total_shit_supply - floor_hook.hook_shit_balance

        # ─── 4b. FLOOR HOOK BUYBACK: if pool price < floor, use floor reserve to buy SHIT ───
        # This is the key mechanism that keeps price above floor — the floor reserve acts as a buyer of last resort
        # Only spends the exact amount needed to push pool price back to floor (not the full cap)
        pool_price = floor_hook.pool_usdc / floor_hook.pool_shit if floor_hook.pool_shit > 0 else 0
        # Band reserve deployment: if floor reserve < 20% of initial, transfer 50% of band reserve to floor
        initial_floor_reserve = params.floor_hook.initial_floor_reserve
        if initial_floor_reserve > 0 and floor_hook.floor_reserve < initial_floor_reserve * 0.20 and floor_hook.band_reserve > 0:
            band_transfer = floor_hook.band_reserve * 0.50
            floor_hook.floor_reserve += band_transfer
            floor_hook.band_reserve -= band_transfer
        # Treasury asset replenishment: treasury deposits non-quote assets (morpho, impact tokens)
        # These count toward display floor at 80% haircut, but NOT toward reserveFloor (redemptions)
        # Treasury doesn't hold USDC — it holds yield-bearing assets that accrue value over time
        asset_replenish = (morpho_yield + impact_yield) * 0.15  # 15% of total asset yield
        if asset_replenish > 0:
            # Track as asset valuation (at haircut) — boosts display floor but not redemption capacity
            floor_hook.asset_valuation = getattr(floor_hook, 'asset_valuation', 0) + asset_replenish * 0.80
        if pool_price < floor_hook.floor_price and floor_hook.floor_reserve > 0 and floor_hook.pool_shit > 0:
            # Calculate how much USDC we need to push pool price back to floor
            # Only spend what's needed — the contract uses sqrtPriceLimit to stop at floor
            k = floor_hook.pool_shit * floor_hook.pool_usdc
            target_pool_shit = (k / floor_hook.floor_price) ** 0.5
            target_pool_usdc = k / target_pool_shit
            usdc_needed = target_pool_usdc - floor_hook.pool_usdc
            # Adaptive buyback cap: scale with how far below floor we are
            # P/F > 0.8x → 5% cap, P/F 0.5-0.8x → 10% cap, P/F < 0.5x → 15% cap (reduced from 20%)
            pf_ratio = pool_price / floor_hook.floor_price if floor_hook.floor_price > 0 else 1.0
            if pf_ratio < 0.5:
                buyback_cap_pct = 0.15
            elif pf_ratio < 0.8:
                buyback_cap_pct = 0.10
            else:
                buyback_cap_pct = 0.05
            max_buyback = floor_hook.floor_reserve * buyback_cap_pct
            usdc_to_spend = min(usdc_needed, max_buyback)
            if usdc_to_spend > 0:
                new_pool_usdc = floor_hook.pool_usdc + usdc_to_spend
                new_pool_shit = k / new_pool_usdc
                shit_bought = floor_hook.pool_shit - new_pool_shit
                floor_hook.pool_usdc = new_pool_usdc
                floor_hook.pool_shit = new_pool_shit
                floor_hook.floor_reserve -= usdc_to_spend
                # Bought SHIT are absorbed by hook (burned from circulating supply)
                floor_hook.hook_shit_balance += shit_bought
                floor_hook.total_shit_absorbed += shit_bought

        # ─── 4c. POST-CB RECOVERY BUYBACK: after CB reset, use treasury USDC to support price ───
        # When CB was tripped and then resets, price is typically well below floor
        # Treasury deploys USDC to buy SHIT and push price back toward floor
        cb_just_reset = False
        if hasattr(staking, '_cb_was_tripped') and staking._cb_was_tripped and not staking.circuit_breaker_tripped:
            cb_just_reset = True
        staking._cb_was_tripped = staking.circuit_breaker_tripped
        if cb_just_reset and pool_price < floor_hook.floor_price and treasury.usdc_balance > 0:
            # Use up to 5% of treasury USDC for one-time recovery buyback
            recovery_usdc = min(treasury.usdc_balance * 0.05, floor_hook.pool_usdc * 0.30)
            if recovery_usdc > 0 and floor_hook.pool_shit > 0:
                k = floor_hook.pool_shit * floor_hook.pool_usdc
                new_pool_usdc = floor_hook.pool_usdc + recovery_usdc
                new_pool_shit = k / new_pool_usdc
                shit_bought = floor_hook.pool_shit - new_pool_shit
                floor_hook.pool_usdc = new_pool_usdc
                floor_hook.pool_shit = new_pool_shit
                treasury.usdc_balance -= recovery_usdc
                # Bought SHIT are burned — permanent supply reduction
                floor_hook.hook_shit_balance += shit_bought
                floor_hook.total_shit_absorbed += shit_bought
                floor_hook.total_shit_supply -= shit_bought

        # ─── 5. STAKING: rebase ───
        # Yield is based on TOTAL supply (SHIT Protocol pattern: SHIT_stakers = totalSupply * rewardRate)
        # Not staked supply — so yield_per_token = base_yield / staking_ratio
        # This means APY is high when few stakers (early protocol) and decreases as ratio rises
        # Early epoch boost: 2x rebase rate for first 10 epochs to allow higher peak APY
        effective_rebase_bps = params.staking.base_yield_per_epoch_bps
        # Smooth taper from 2x → 1x over epochs 0-30 (gradual decline, no cliff)
        if epoch < 30:
            taper = 2.0 - (epoch / 30.0)  # 2.0 at ep0 → 1.0 at ep30, smooth linear
            effective_rebase_bps = params.staking.base_yield_per_epoch_bps * taper
        contract_balance = staking.shit_supply * effective_rebase_bps / BPS_DENOMINATOR
        base_yield_per_token = (contract_balance * 1e18) / staking.st_shit_supply if staking.st_shit_supply > 0 else 0
        yield_fraction = base_yield_per_token / 1e18 if base_yield_per_token > 0 else 0
        new_index = staking.staking_index + yield_fraction  # Additive: index grows by yield per epoch
        staking.base_yield = contract_balance

        # Circuit breaker (with grace period + auto-reset + gradual softening + forced reset)
        in_grace_period = epoch < params.staking.deployment_grace_epochs
        # Forced reset check first — triggers regardless of price
        if staking.circuit_breaker_tripped:
            epochs_tripped = epoch - getattr(staking, 'circuit_breaker_trip_epoch', epoch)
            if epochs_tripped >= 55:
                staking.circuit_breaker_tripped = False
                staking.circuit_breaker_count = 0
                staking.circuit_breaker_recovery_count = 0
        if staking.floor_price > 0 and staking.twap_price < staking.floor_price and not in_grace_period:
            # Cooldown: don't count below-floor epochs for 10 epochs after a reset
            cb_reset_cooldown = getattr(staking, 'circuit_breaker_reset_epoch', -100)
            if epoch - cb_reset_cooldown >= 10:
                staking.circuit_breaker_count += 1
            staking.circuit_breaker_recovery_count = 0
            if staking.circuit_breaker_count >= params.staking.circuit_breaker_threshold and not staking.circuit_breaker_tripped:
                staking.circuit_breaker_tripped = True
                staking.circuit_breaker_trip_epoch = epoch
        elif staking.circuit_breaker_tripped:
            # Recovery logic only (forced reset already checked above)
            if staking.twap_price >= staking.floor_price:
                staking.circuit_breaker_recovery_count += 1
                # Gradual softening: after 60 epochs tripped, reduce reset threshold from 21 to 7
                effective_reset = params.staking.circuit_breaker_auto_reset
                if epochs_tripped > 60:
                    effective_reset = 7  # Soften after 20 days tripped
                if staking.circuit_breaker_recovery_count >= effective_reset:
                    staking.circuit_breaker_tripped = False
                    staking.circuit_breaker_count = 0
                    staking.circuit_breaker_recovery_count = 0
                    staking.circuit_breaker_reset_epoch = epoch  # Cooldown: CB can't retrip for 10 epochs
            else:
                staking.circuit_breaker_recovery_count = 0
        else:
            staking.circuit_breaker_count = 0

        # Supplemental emissions (with rate limiter)
        staking.supplemental_mint = 0.0
        # Rolling rate limiter: decay window minted gradually instead of hard reset
        # This prevents the APY bump that occurs at window boundaries
        supp_warmup_end = 30
        rate_limiter_active = epoch >= supp_warmup_end
        # Gradual decay of window minted (decay 5% per epoch = ~50% over 10 epochs)
        staking.supplemental_window_minted *= 0.95
        supplemental_window_cap = staking.st_shit_supply * 0.05
        if (staking.nav_per_shit > 0 and staking.twap_price > staking.nav_per_shit
            and not staking.circuit_breaker_tripped
            and staking.staking_ratio > 0.50):  # Gate: don't mint supplemental during stress exodus
            premium_bps = (staking.twap_price * BPS_DENOMINATOR) / staking.nav_per_shit
            if premium_bps >= params.staking.k_bps:
                staking.supplemental_mint = (staking.st_shit_supply * params.staking.r_max) / BPS_DENOMINATOR
            else:
                excess = premium_bps - BPS_DENOMINATOR
                range_bps = params.staking.k_bps - BPS_DENOMINATOR
                if range_bps > 0:
                    staking.supplemental_mint = (staking.st_shit_supply * params.staking.r_max * excess) / (range_bps * BPS_DENOMINATOR)

            # RFV invariant — allow supplemental if backing ratio > 90%, scale proportionally
            new_supply = staking.shit_supply + staking.supplemental_mint
            required_rfv = new_supply * staking.floor_price
            if staking.rfv > 0:
                backing_ratio = staking.rfv / required_rfv if required_rfv > 0 else 0
                if backing_ratio < 0.90:
                    staking.supplemental_mint = 0.0
                elif backing_ratio < 1.0:
                    # Scale down supplemental proportionally to remaining headroom
                    staking.supplemental_mint *= (backing_ratio - 0.90) / 0.10
            else:
                staking.supplemental_mint = 0.0

            # Rate limiter: cap cumulative supplemental per 30-epoch window at 5% of st_shit_supply
            # Only enforce after warmup period
            if rate_limiter_active:
                remaining_cap = supplemental_window_cap - staking.supplemental_window_minted
                if staking.supplemental_mint > remaining_cap:
                    staking.supplemental_mint = max(0.0, remaining_cap)

            if staking.supplemental_mint > 0:
                supp_yield = (staking.supplemental_mint * 1e18) / staking.st_shit_supply / 1e18
                new_index += supp_yield  # Add supplemental yield on top of base yield
                # NOTE: supplemental does NOT add to rebase_rate_bps — it's a separate mint, not a rebase
                staking.total_supplemental_minted += staking.supplemental_mint
                staking.supplemental_window_minted += staking.supplemental_mint

        old_index = staking.staking_index
        staking.staking_index = new_index if new_index > 0 else staking.staking_index
        # Rebase rate = yield fraction per epoch (not index ratio, which dilutes over time)
        staking.rebase_rate_bps = yield_fraction * BPS_DENOMINATOR if yield_fraction > 0 else 0
        staking.rebase_rate_bps = min(staking.rebase_rate_bps, 70.0)  # Cap rebase at 0.7% per epoch (matches SHIT Protocol peak ~180K% APY)
        # Track rebase-minted tokens for informational purposes (not new supply — index growth only)
        rebase_minted = yield_fraction * staking.st_shit_supply
        staking.total_rebase_minted += rebase_minted
        staking.shit_supply += staking.supplemental_mint
        treasury.shit_supply = staking.shit_supply

        # Staker behavior
        staking.staking_apy = ((1 + staking.rebase_rate_bps / BPS_DENOMINATOR) ** (EPOCHS_PER_DAY * 365) - 1) * 100
        staking.staking_apy = min(staking.staking_apy, 220000.0)  # Cap at 220,000% (SHIT Protocol peak was 180,724%)
        market_yield = 5.0
        apy_premium = staking.staking_apy - market_yield
        target_ratio = min(0.95, max(0.05, staking.staking_ratio + apy_premium / 100 * params.staking.stake_elasticity * 0.01))
        if staking.circuit_breaker_tripped:
            target_ratio = max(0.05, staking.staking_ratio * 0.9)
        staking.staking_ratio += (target_ratio - staking.staking_ratio) * 0.03  # Slow adjustment for gradual APY decline
        staking.st_shit_supply = staking.shit_supply * staking.staking_ratio

        # ─── 5b. GOVERNANCE + GELATO (with fallback keeper) ───
        # Gelato outage check
        if params.governance.gelato_enabled:
            if not governance.gelato_outage_active:
                if rng.random() < params.governance.gelato_outage_probability:
                    governance.gelato_outage_active = True
                    governance.gelato_outage_epochs = params.governance.gelato_outage_duration_epochs
                    governance.total_gelato_outages += 1
                    governance.gelato_active = False
                    governance.fallback_keeper_active = False
            else:
                governance.gelato_outage_epochs -= 1
                # Fallback keeper activates after delay
                if not governance.fallback_keeper_active and params.governance.fallback_keeper_enabled:
                    outage_elapsed = params.governance.gelato_outage_duration_epochs - governance.gelato_outage_epochs
                    if outage_elapsed >= params.governance.fallback_keeper_activation_delay:
                        governance.fallback_keeper_active = True
                        governance.fallback_epochs += 1
                elif governance.fallback_keeper_active:
                    governance.fallback_epochs += 1

                if governance.gelato_outage_epochs <= 0:
                    governance.gelato_outage_active = False
                    governance.gelato_active = True
                    governance.fallback_keeper_active = False

        # Governance proposals
        if params.governance.governance_enabled and rng.random() < params.governance.proposal_frequency:
            governance.active_proposals += 1
        if rng.random() < params.governance.flash_loan_risk:
            governance.flash_loan_attacks += 1

        # Token registry onboarding (with min liquidity check)
        if params.governance.impact_token_onboarding_enabled and rng.random() < params.governance.new_token_frequency:
            # Check minimum liquidity requirement
            token_liquidity = rng.lognormal(8, 1.5)  # Simulate liquidity depth
            if not params.governance.liquidity_check_enabled or token_liquidity >= params.governance.min_liquidity_usd:
                governance.onboarded_tokens += 1
                token_value = params.governance.new_token_avg_value * rng.uniform(0.5, 2.0)
                governance.total_onboarded_value += token_value
                if rng.random() < params.governance.new_token_liquidity_risk:
                    governance.illiquid_tokens += 1
                    treasury.impact_token_value += token_value * 0.3
                else:
                    treasury.impact_token_value += token_value

        # ─── 6. BONDING: premium seller (gated by Gelato + authorized_minter) ───
        bonding.shit_supply = staking.shit_supply
        bonding.treasury_usdc = treasury.usdc_balance
        bonding.pool_shit = floor_hook.pool_shit
        bonding.pool_usdc = floor_hook.pool_usdc

        # ─── 6a. STANDARD BONDS — USDC in, SHIT minted at discount ───
        bonding.nav_per_shit = treasury.nav_per_shit
        premium_ratio = staking.twap_price / bonding.nav_per_shit if bonding.nav_per_shit > 0 else 1.0
        bond_discount = params.bonding.bond_discount_bps * max(1.0, premium_ratio)
        bond_demand = params.bonding.bond_capacity_per_epoch * (
            1 + bond_discount / BASIS_POINTS * 5.0  # bond_demand_elasticity
        )
        bond_demand *= rng.uniform(0.5, 1.5)
        if bond_demand > 0 and staking.twap_price > 0:
            shit_from_bonds = bond_demand / (staking.twap_price * (1 - bond_discount / BASIS_POINTS))
            treasury.usdc_balance += bond_demand
            staking.shit_supply += shit_from_bonds
            treasury.shit_supply = staking.shit_supply
            bonding.total_shit_bonded += shit_from_bonds
            bonding.total_usdc_from_bonds += bond_demand

        bonding.premium_active = False
        premium_seller_operational = (governance.gelato_active or governance.fallback_keeper_active) and params.governance.authorized_minter_set
        if premium_seller_operational and (bonding.twap_price > bonding.nav_per_shit * params.bonding.premium_threshold):
            shit_to_sell = bonding.pool_shit * params.bonding.clip_bps / BASIS_POINTS
            k = bonding.pool_shit * bonding.pool_usdc
            new_pool_shit = bonding.pool_shit + shit_to_sell
            new_pool_usdc = k / new_pool_shit
            usdc_received = bonding.pool_usdc - new_pool_usdc

            bonding.pool_shit = new_pool_shit
            bonding.pool_usdc = new_pool_usdc
            floor_hook.pool_shit = new_pool_shit
            floor_hook.pool_usdc = new_pool_usdc
            staking.shit_supply += shit_to_sell
            treasury.shit_supply = staking.shit_supply
            treasury.usdc_balance += usdc_received * params.premium_proceeds_to_treasury_pct
            bonding.total_shit_sold_premium += shit_to_sell
            bonding.total_usdc_from_premium += usdc_received
            bonding.premium_active = True

        # ─── 6b. BONDING: inverse bonds (buyback + burn when price < NAV) ───
        bonding.nav_per_shit = treasury.nav_per_shit
        if bonding.twap_price < bonding.nav_per_shit and bonding.nav_per_shit > 0 and treasury.usdc_balance > 0:
            nav_premium = (bonding.nav_per_shit / bonding.twap_price - 1) if bonding.twap_price > 0 else 0
            inverse_capacity = treasury.usdc_balance * params.bonding.max_capacity_bps / BASIS_POINTS
            inverse_demand_shit = inverse_capacity / (
                bonding.nav_per_shit * (1 - params.bonding.inverse_spread_bps / BASIS_POINTS)
            ) * min(1.0, nav_premium * 2) if bonding.nav_per_shit > 0 else 0
            inverse_demand_shit = min(inverse_demand_shit, staking.shit_supply * 0.02)
            if inverse_demand_shit > 0:
                usdc_paid = inverse_demand_shit * bonding.nav_per_shit * (1 - params.bonding.inverse_spread_bps / BASIS_POINTS)
                treasury.usdc_balance -= usdc_paid
                staking.shit_supply -= inverse_demand_shit
                treasury.shit_supply = staking.shit_supply
                bonding.total_shit_burned_inverse += inverse_demand_shit
                bonding.total_usdc_paid_inverse += usdc_paid

        # ─── 7. STABLECOAN: RBS + PegKeeper (gated by Gelato) ───
        stablecoin.lower_target_wall = stablecoin.target_price * (1 - params.stablecoin.lower_wall)
        stablecoin.upper_target_wall = stablecoin.target_price * (1 + params.stablecoin.upper_wall)

        ma_window = params.stablecoin.target_ma_days * 3
        stablecoin.ma_target = np.mean(price_history[-ma_window:])
        stablecoin.target_price = max(stablecoin.ma_target, 1.0)

        # Perp vault: Bucky demand from margin + liquidations (with health factor + partial liquidation + circuit breaker)
        if params.bamm_perp.perp_enabled:
            # OI evolves organically — only set initially, then grow from new positions + shrink from liquidations
            if epoch == 0 or bamm.perp_open_interest == 0:
                bamm.perp_open_interest = bamm.perp_tvl * params.bamm_perp.open_interest_pct * (1 + rng.normal(0, 0.05) * 0.1)
            else:
                # Organic growth from new positions (small, proportional to TVL)
                new_oi = bamm.perp_tvl * 0.02 * rng.uniform(0.5, 1.5)  # ~2% of TVL in new positions per epoch
                bamm.perp_open_interest += new_oi
            bamm.bucky_locked_in_perps = bamm.perp_tvl
            # Progressive OI reduction: if OI/TVL > 150%, force deleveraging
            oi_ratio = bamm.perp_open_interest / bamm.perp_tvl if bamm.perp_tvl > 0 else 0
            if oi_ratio > 1.5 and not bamm.perp_circuit_breaker:
                # Force partial liquidation of excess OI — 50% of excess per epoch
                excess_oi = bamm.perp_open_interest - bamm.perp_tvl * 1.5
                deleverage_amount = excess_oi * 0.50
                deleverage_loss = deleverage_amount * 0.02  # 2% penalty on forced deleveraging
                bamm.perp_open_interest -= deleverage_amount
                bamm.perp_tvl -= deleverage_loss
                bamm.perp_liquidations += 1  # Count as a liquidation event
            # Funding rate
            bamm.funding_rate = params.bamm_perp.funding_rate_factor * (params.bamm_perp.long_short_ratio - 1.0) + rng.normal(0, params.bamm_perp.funding_rate_volatility)
            # Liquidation with health factor check + partial liquidation
            price_move = rng.normal(0, params.bamm_perp.price_volatility / np.sqrt(EPOCHS_PER_DAY))
            liquidation_prob = max(0, abs(price_move) - 0.05) * 5  # Less sensitive: 5% threshold, 5x multiplier
            if rng.random() < liquidation_prob and not bamm.perp_circuit_breaker:
                # Check if liquidation can proceed — Gelato or fallback keeper must be active
                keeper_active = governance.gelato_active or governance.fallback_keeper_active
                if not keeper_active:
                    # No keeper available — position stays underwater, accrue bad debt
                    bamm.total_bad_debt += position_loss * 0.1  # Slow bleed
                    pass
                else:
                    # Calculate position loss as % of collateral
                    loss_pct = abs(price_move) * params.bamm_perp.open_interest_pct
                    position_loss = bamm.perp_tvl * loss_pct

                    # Health factor = 1 / (1 + loss_pct) — matches contract formula
                    health_factor = 1.0 / (1.0 + loss_pct) if loss_pct > 0 else 1.0
                    force_full = health_factor < (params.bamm_perp.critical_health_factor_bps / 10000)

                    if force_full:
                        bamm.perp_liquidations += 1
                        bamm.full_liquidations_forced += 1
                        actual_loss = min(position_loss, bamm.perp_tvl)
                        if position_loss > bamm.perp_tvl:
                            bamm.total_bad_debt += position_loss - bamm.perp_tvl
                        bamm.perp_tvl -= actual_loss
                        bamm.perp_tvl = max(bamm.perp_tvl, 100_000.0)
                    else:
                        # Partial liquidation: 50% of position
                        # Fallback keeper can also do partials (matching contract's fallbackLiquidate)
                        liq_size = bamm.perp_open_interest * params.bamm_perp.partial_liquidation_bps / 10000
                        liq_loss = min(liq_size * loss_pct, liq_size)  # Cap at position size — no bad debt
                        liq_bonus = liq_size * params.bamm_perp.liquidation_bonus_pct
                        bamm.perp_liquidations += 1
                        bamm.perp_tvl -= liq_bonus + liq_loss

                    # Track for circuit breaker
                    bamm.liquidation_history.append(epoch)
                    bamm.liquidation_history = [e for e in bamm.liquidation_history if e > epoch - params.bamm_perp.perp_cb_window_epochs]
                    if len(bamm.liquidation_history) >= params.bamm_perp.perp_cb_threshold:
                        bamm.perp_circuit_breaker = True
                        bamm.perp_cb_cooldown = 9  # 3 days cooldown

            # Perp circuit breaker cooldown
            if bamm.perp_circuit_breaker:
                bamm.perp_cb_cooldown -= 1
                if bamm.perp_cb_cooldown <= 0:
                    bamm.perp_circuit_breaker = False
                    bamm.liquidation_history = []

            # Post-liquidation OI cap: liquidations reduce TVL, so re-check and hard-cap OI at 150% TVL
            if bamm.perp_tvl > 0:
                max_oi = bamm.perp_tvl * 1.5
                if bamm.perp_open_interest > max_oi:
                    bamm.perp_open_interest = max_oi

            # Bucky locked in perps supports peg
            if stablecoin.bucky_supply > 0:
                stablecoin.peg_price += (bamm.bucky_locked_in_perps / stablecoin.bucky_supply) * 0.001

        # Cooler loans: Bucky borrowing demand supports peg (with peg-support interest discount)
        cooler_effective_rate = params.market_structure.cooler_interest_rate_apy
        if params.market_structure.cooler_enabled:
            cooler_effective_rate = params.market_structure.cooler_interest_rate_apy
            demand_boost = 1.0
            if params.market_structure.cooler_peg_support_enabled and staking.twap_price < staking.floor_price and staking.floor_price > 0:
                deficit_pct = (staking.floor_price - staking.twap_price) / staking.floor_price
                discount_bps = min(
                    deficit_pct * 100 * params.market_structure.cooler_peg_discount_bps,
                    params.market_structure.cooler_max_peg_discount_bps
                )
                cooler_effective_rate = params.market_structure.cooler_interest_rate_apy * (1 - discount_bps / 10000)
                demand_boost = 1 + (discount_bps / 10000) * 2

            cooler_borrow = params.market_structure.cooler_borrow_demand_per_epoch * rng.uniform(0.5, 1.5) * demand_boost
            ms_cooler_bucky_locked += cooler_borrow
            ms_cooler_interest += ms_cooler_bucky_locked * cooler_effective_rate / 365 / EPOCHS_PER_DAY
            if rng.random() < params.market_structure.cooler_default_rate:
                ms_cooler_bucky_locked *= 0.95
            # Cooler demand supports peg
            if stablecoin.bucky_supply > 0:
                stablecoin.peg_price += (cooler_borrow / stablecoin.bucky_supply) * 0.0005

        # ─── 7a. ORGANIC BUCKY MINTING — users mint Bucky via PSM as protocol grows ───
        # Bucky demand scales with trading volume and treasury growth
        if stablecoin.peg_price >= 0.99:  # Only mint when peg is healthy
            # Base demand from DEX trading (scales with protocol activity)
            base_demand = effective_swap_fees * 0.5
            # Additional demand from perp margin (traders need Bucky for collateral)
            perp_demand = bamm.perp_tvl * 0.001 if params.bamm_perp.perp_enabled else 0
            # Cooler loan demand
            cooler_demand = cooler_borrow * 0.1 if params.market_structure.cooler_enabled else 0
            # Total new Bucky minted this epoch (users deposit USDC to PSM, get Bucky)
            new_bucky = base_demand + perp_demand + cooler_demand
            if new_bucky > 0:
                stablecoin.bucky_supply += new_bucky
                stablecoin.psm_usdc += new_bucky * stablecoin.peg_price
                # Deploy to AMOs proportionally
                stablecoin.lending_amo_position = stablecoin.bucky_supply * params.stablecoin.lending_amo_pct
                stablecoin.liquidity_amo_position = stablecoin.bucky_supply * params.stablecoin.liquidity_amo_pct

        peg_dev = abs((stablecoin.peg_price - 1.0) * BASIS_POINTS)
        stablecoin.pegkeeper_active = False
        if peg_dev > params.stablecoin.peg_tolerance_bps:
            epochs_since = epoch - stablecoin.last_pegkeeper_action
            min_interval = params.stablecoin.action_delay_minutes / (8 * 60)
            # PegKeeper gated by Gelato
            if epochs_since >= min_interval and (governance.gelato_active or governance.fallback_keeper_active):
                adjustment = (stablecoin.peg_price - 1.0) * stablecoin.bucky_supply * 0.01
                if stablecoin.peg_price > 1.0:
                    stablecoin.bucky_supply += adjustment
                    stablecoin.psm_usdc += adjustment * stablecoin.peg_price
                else:
                    stablecoin.bucky_supply -= adjustment
                    stablecoin.psm_usdc -= adjustment * stablecoin.peg_price
                stablecoin.pegkeeper_active = True
                stablecoin.last_pegkeeper_action = epoch
                stablecoin.total_pegkeeper_actions += 1
                stablecoin.peg_price += (1.0 - stablecoin.peg_price) * 0.1

        # ─── 7b. MARKET STRUCTURE: LBP, V1 migration, CDS, Folio, Burner ───
        # LBP phase
        lbp_active = False
        if params.market_structure.lbp_enabled and not ms_lbp_complete:
            lbp_active = True
            lbp_progress = min(epoch / (params.market_structure.lbp_duration_days * EPOCHS_PER_DAY), 1.0)
            lbp_price = params.market_structure.lbp_start_price * (1 - lbp_progress) + params.market_structure.lbp_end_price * lbp_progress
            tokens_sold = params.market_structure.lbp_tokens_sold / (params.market_structure.lbp_duration_days * EPOCHS_PER_DAY)
            ms_lbp_usdc += tokens_sold * lbp_price
            ms_lbp_tokens_minted += tokens_sold
            staking.shit_supply += tokens_sold
            treasury.shit_supply = staking.shit_supply
            if lbp_progress >= 1.0:
                ms_lbp_complete = True
                lbp_active = False
            # Override market price during LBP
            staking.twap_price = lbp_price
            bonding.twap_price = lbp_price

        # V1 migration
        v1_sell_pressure = 0.0
        if params.market_structure.v1_migration_enabled and ms_v1_remaining > 0:
            v1_migrated = min(ms_v1_remaining * params.market_structure.v1_migration_rate_per_epoch, ms_v1_remaining)
            ms_v1_remaining -= v1_migrated
            ms_v1_minted += v1_migrated
            staking.shit_supply += v1_migrated
            treasury.shit_supply = staking.shit_supply
            v1_sell_pressure = v1_migrated * params.market_structure.v1_holder_sell_pressure
            # Sell pressure pushes price down
            staking.twap_price *= (1 - v1_sell_pressure * 0.0001)
            staking.twap_price = max(staking.twap_price, 0.01)
            bonding.twap_price = staking.twap_price

        # CDS minting (with dynamic rate limit + supply cap)
        cds_shit_epoch = 0.0
        if params.market_structure.cds_enabled and rng.random() < params.market_structure.cds_deposit_frequency:
            deposit_size = params.market_structure.cds_avg_deposit_size * rng.uniform(0.5, 3.0)
            nav_per_shit = treasury.nav_per_shit if treasury.nav_per_shit > 0 else 8.0
            # Dynamic discount: tighten when price below floor (less attractive)
            discount = params.market_structure.cds_discount_pct
            if params.market_structure.cds_dynamic_discount and staking.twap_price < staking.floor_price and staking.floor_price > 0:
                price_ratio = staking.twap_price / staking.floor_price
                discount = max(0.01, params.market_structure.cds_discount_pct * price_ratio)
            mint_price = nav_per_shit * (1 - discount)
            cds_shit_epoch = deposit_size / mint_price

            # Dynamic rate limit: reduced when price below floor
            effective_rate_limit = params.market_structure.cds_rate_limit_pct
            if staking.twap_price < staking.floor_price and staking.floor_price > 0:
                effective_rate_limit = params.market_structure.cds_rate_limit_floor_pct

            # Total supply cap: CDS can never exceed X% of total supply
            remaining_cap = (staking.shit_supply * params.market_structure.cds_total_supply_cap_pct) - ms_cds_minted
            if remaining_cap <= 0:
                cds_shit_epoch = 0.0
            else:
                max_mint = min(staking.shit_supply * effective_rate_limit, remaining_cap)
                if cds_shit_epoch > max_mint:
                    cds_shit_epoch = max_mint
                    deposit_size = cds_shit_epoch * mint_price

            if cds_shit_epoch > 0:
                ms_cds_minted += cds_shit_epoch
                ms_cds_usdc += deposit_size
                staking.shit_supply += cds_shit_epoch
                treasury.shit_supply = staking.shit_supply
                treasury.usdc_balance += deposit_size

        # Folio index demand
        folio_demand = 0.0
        if params.market_structure.folio_enabled:
            ms_folio_tvl *= (1 + params.market_structure.folio_growth_rate / EPOCHS_PER_DAY)
            if epoch % params.market_structure.folio_rebalance_frequency == 0 and epoch > 0:
                folio_demand = ms_folio_tvl * params.market_structure.folio_shit_weight_pct * 0.1 / staking.twap_price

        # POL migration losses (with cooldown + slippage cap)
        if params.market_structure.pol_migrations_enabled and rng.random() < params.market_structure.pol_migration_frequency:
            if epoch - ms_last_pol_migration >= params.market_structure.pol_migration_cooldown_epochs:
                effective_slippage = min(
                    params.market_structure.pol_migration_slippage_pct * rng.uniform(0.5, 2.0),
                    params.market_structure.pol_max_slippage_pct
                )
                migration_size = treasury.pol_value * params.market_structure.pol_migration_cap_pct
                pol_loss = migration_size * effective_slippage
                ms_pol_migration_losses += pol_loss
                treasury.pol_value -= pol_loss
                ms_last_pol_migration = epoch

        # Burner: deflationary mechanism
        shit_burned_epoch = 0.0
        if params.burner_enabled and treasury.usdc_balance > params.fee_routing.burn_threshold_usdc:
            shit_burned_epoch = staking.shit_supply * params.fee_routing.burn_pct_per_epoch * 0.001
            staking.shit_supply -= shit_burned_epoch
            staking.shit_supply = max(staking.shit_supply, 100_000)
            treasury.shit_supply = staking.shit_supply
            ms_shit_burned += shit_burned_epoch

        # ─── 8. RECORD ───
        market_price = floor_hook.pool_usdc / floor_hook.pool_shit if floor_hook.pool_shit > 0 else 0
        premium_discount = ((staking.twap_price / staking.nav_per_shit) - 1) * 100 if staking.nav_per_shit > 0 else 0

        # Add staking fee yield + bribes + supplemental to APY
        # Use blended price (max of TWAP and floor) to prevent yield spike when TWAP crashes
        blended_price = max(staking.twap_price, staking.floor_price) if staking.floor_price > 0 else staking.twap_price
        staking_fee_yield = min((staking_from_fees / blended_price) / staking.st_shit_supply * EPOCHS_PER_DAY * 365 * 100 if staking.st_shit_supply > 0 and blended_price > 0 else 0, 100.0)
        bribe_yield = min((staker_bribes / blended_price) / staking.st_shit_supply * EPOCHS_PER_DAY * 365 * 100 if staking.st_shit_supply > 0 and blended_price > 0 else 0, 100.0)
        # Supplemental yield APY: annualize the supplemental mint as % of st_shit_supply
        supp_yield_epoch = staking.supplemental_mint / staking.st_shit_supply if staking.st_shit_supply > 0 else 0
        supp_apy = ((1 + supp_yield_epoch) ** (EPOCHS_PER_DAY * 365) - 1) * 100 if supp_yield_epoch > 0 else 0
        supp_apy = min(supp_apy, 180000.0)  # Cap supplemental APY contribution
        total_staking_apy = min(staking.staking_apy + staking_fee_yield + bribe_yield + supp_apy, 220000.0)

        records.append({
            'epoch': epoch,
            'day': epoch / 3,
            'quote_token': params.quote_token,
            # Staking
            'shit_supply': staking.shit_supply,
            'st_shit_supply': staking.st_shit_supply,
            'staking_index': staking.staking_index,
            'staking_ratio': staking.staking_ratio,
            'staking_apy': total_staking_apy,
            'base_rebase_apy': staking.staking_apy,
            'fee_yield_apy': staking_fee_yield,
            'bribe_yield_apy': bribe_yield,
            'rebase_rate_bps': staking.rebase_rate_bps,
            'supplemental_mint': staking.supplemental_mint,
            'rebase_minted': rebase_minted,
            'total_rebase_minted': staking.total_rebase_minted,
            'circuit_breaker_tripped': staking.circuit_breaker_tripped,
            'circuit_breaker_count': staking.circuit_breaker_count,
            'circuit_breaker_recovery_count': staking.circuit_breaker_recovery_count,
            # Treasury
            'rfv': treasury.rfv,
            'nav': treasury.nav,
            'floor_price': treasury.floor_price,
            'nav_per_shit': treasury.nav_per_shit,
            'treasury_usdc': treasury.usdc_balance,
            'treasury_total': treasury.usdc_balance + treasury.morpho_position + treasury.impact_token_value + treasury.pol_value,
            # Floor hook
            'hook_floor_price': floor_hook.floor_price,
            'reserve_floor': floor_hook.reserve_floor,
            'floor_reserve': floor_hook.floor_reserve,
            'band_reserve': floor_hook.band_reserve,
            'hook_shit': floor_hook.hook_shit_balance,
            'redeemable_supply': floor_hook.redeemable_supply,
            'market_price': market_price,
            # Bonding
            'premium_seller_active': bonding.premium_active,
            'total_shit_sold_premium': bonding.total_shit_sold_premium,
            'shit_burned_inverse': bonding.total_shit_burned_inverse,
            'usdc_paid_inverse': bonding.total_usdc_paid_inverse,
            'total_shit_bonded': bonding.total_shit_bonded,
            'total_usdc_from_bonds': bonding.total_usdc_from_bonds,
            # Stablecoin
            'bucky_peg': stablecoin.peg_price,
            'bucky_supply': stablecoin.bucky_supply,
            'pegkeeper_active': stablecoin.pegkeeper_active,
            # Fee routing
            'treasury_from_fees': fee_routing.treasury_fee_accumulated,
            'staking_from_fees': fee_routing.staking_fee_accumulated,
            'management_fees': fee_routing.management_fee_accumulated,
            'mgmt_bps': mgmt_bps,
            # BAMM + Perps
            'bamm_tvl': bamm.lp_tvl,
            'bamm_yield': bamm.bamm_yield_accumulated,
            'perp_tvl': bamm.perp_tvl,
            'perp_oi': bamm.perp_open_interest,
            'funding_rate': bamm.funding_rate,
            'bucky_locked_perps': bamm.bucky_locked_in_perps,
            'perp_liquidations': bamm.perp_liquidations,
            'perp_circuit_breaker': bamm.perp_circuit_breaker,
            'perp_bad_debt': bamm.total_bad_debt,
            'full_liquidations_forced': bamm.full_liquidations_forced,
            # Bribes
            'bribe_rate_apy': bribe_rate,
            'epoch_bribes': epoch_bribes,
            'cum_bribes': fee_routing.treasury_fee_accumulated * 0 + epoch_bribes * (epoch + 1),  # approx
            # Governance
            'gelato_active': governance.gelato_active,
            'gelato_outage': governance.gelato_outage_active,
            'fallback_keeper_active': governance.fallback_keeper_active,
            'total_gelato_outages': governance.total_gelato_outages,
            'active_proposals': governance.active_proposals,
            'flash_loan_attacks': governance.flash_loan_attacks,
            'onboarded_tokens': governance.onboarded_tokens,
            'illiquid_tokens': governance.illiquid_tokens,
            'config_errors': governance.config_errors,
            # Market structure
            'lbp_active': lbp_active,
            'lbp_usdc_raised': ms_lbp_usdc,
            'lbp_tokens_minted': ms_lbp_tokens_minted,
            'v1_remaining': ms_v1_remaining,
            'v1_minted': ms_v1_minted,
            'v1_sell_pressure': v1_sell_pressure,
            'cds_shit_minted': cds_shit_epoch,
            'cds_total_minted': ms_cds_minted,
            'folio_tvl': ms_folio_tvl,
            'folio_demand': folio_demand,
            'cooler_bucky_locked': ms_cooler_bucky_locked,
            'cooler_interest': ms_cooler_interest,
            'cooler_effective_rate': cooler_effective_rate if params.market_structure.cooler_enabled else 0,
            'pol_migration_losses': ms_pol_migration_losses,
            'shit_burned': shit_burned_epoch,
            'cum_shit_burned': ms_shit_burned,
            'shit_absorbed_epoch': floor_hook.total_shit_absorbed - prev_shit_absorbed,
            'cum_shit_absorbed': floor_hook.total_shit_absorbed,
            'asset_valuation': getattr(floor_hook, 'asset_valuation', 0.0),
            'bamm_yield_to_floor': bamm_to_floor if 'bamm_to_floor' in dir() else 0.0,
            # Derived
            'premium_to_nav_pct': premium_discount,
            'price_vs_floor_pct': min(((market_price / floor_hook.floor_price) - 1) * 100, 500) if floor_hook.floor_price > 0.01 else 0,
        })

    return pd.DataFrame(records)
