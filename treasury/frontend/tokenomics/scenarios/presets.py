"""
Predefined scenario presets for SHIT Protocol tokenomics simulation.

Each scenario returns a ProtocolParams configured for a specific market condition.
"""

from models.staking_model import StakingParams
from models.treasury_model import TreasuryParams
from models.floor_hook_model import FloorHookParams
from models.bonding_model import BondingParams
from models.stablecoin_model import StablecoinParams
from models.protocol_model import ProtocolParams


def bull_market() -> ProtocolParams:
    """Rising price, high staking, premium seller active, growing treasury."""
    return ProtocolParams(
        staking=StakingParams(
            initial_price=10.0,
            initial_nav_per_shit=0.0,
            initial_floor_price=0.0,
            initial_staking_ratio=0.75,
            price_drift=0.003,
            price_volatility=0.04,
            base_yield_per_epoch_bps=40.0,
            num_epochs=180,
        ),
        treasury=TreasuryParams(
            initial_usdc=0.0,
            initial_morpho=0.0,
            initial_impact_tokens=0.0,
            initial_pol=0.0,
            morpho_apy=0.06,
            pol_fee_apy=0.20,
            num_epochs=180,
        ),
        floor_hook=FloorHookParams(
            initial_floor_reserve=0.0,
            initial_band_reserve=0.0,
            base_buy_volume_usdc=300_000.0,
            base_sell_volume_shit=3_000.0,
            num_epochs=180,
        ),
        bonding=BondingParams(
            bond_capacity_per_epoch=10_000.0,
            num_epochs=180,
        ),
        stablecoin=StablecoinParams(
            initial_bucky_supply=0.0,
            initial_psm_usdc=0.0,
            num_epochs=180,
        ),
        num_epochs=180,
    )


def bear_market() -> ProtocolParams:
    """Declining price, falling staking, inverse bonds active, circuit breaker pressure."""
    return ProtocolParams(
        staking=StakingParams(
            initial_price=8.0,
            initial_nav_per_shit=0.0,
            initial_floor_price=0.0,
            initial_staking_ratio=0.50,
            price_drift=-0.003,
            price_volatility=0.06,
            base_yield_per_epoch_bps=40.0,
            num_epochs=180,
        ),
        treasury=TreasuryParams(
            initial_usdc=0.0,
            initial_morpho=0.0,
            initial_impact_tokens=0.0,
            initial_pol=0.0,
            morpho_apy=0.03,
            pol_fee_apy=0.08,
            num_epochs=180,
        ),
        floor_hook=FloorHookParams(
            initial_floor_reserve=0.0,
            initial_band_reserve=0.0,
            base_buy_volume_usdc=40_000.0,
            base_sell_volume_shit=15_000.0,
            num_epochs=180,
        ),
        bonding=BondingParams(
            bond_capacity_per_epoch=5_000.0,
            num_epochs=180,
        ),
        stablecoin=StablecoinParams(
            initial_bucky_supply=0.0,
            initial_psm_usdc=0.0,
            num_epochs=180,
        ),
        num_epochs=180,
    )


def death_spiral() -> ProtocolParams:
    """Price crashes below floor, mass unstaking, supplemental emissions fuel sell pressure."""
    return ProtocolParams(
        staking=StakingParams(
            initial_price=6.0,
            initial_nav_per_shit=0.0,
            initial_floor_price=0.0,
            initial_staking_ratio=0.80,
            price_drift=-0.015,
            price_volatility=0.10,
            base_yield_per_epoch_bps=40.0,
            r_max=45,
            k_bps=17500,
            circuit_breaker_threshold=3,
            stake_elasticity=4.0,
            num_epochs=120,
        ),
        treasury=TreasuryParams(
            initial_usdc=0.0,
            initial_morpho=0.0,
            initial_impact_tokens=0.0,
            initial_pol=0.0,
            morpho_apy=0.02,
            pol_fee_apy=0.03,
            impact_token_apy=0.02,
            num_epochs=120,
        ),
        floor_hook=FloorHookParams(
            initial_floor_reserve=0.0,
            initial_band_reserve=0.0,
            base_buy_volume_usdc=10_000.0,
            base_sell_volume_shit=30_000.0,
            redemption_probability=0.3,
            redemption_size_pct=0.10,
            num_epochs=120,
        ),
        bonding=BondingParams(
            bond_capacity_per_epoch=2_000.0,
            num_epochs=120,
        ),
        stablecoin=StablecoinParams(
            initial_bucky_supply=0.0,
            initial_psm_usdc=0.0,
            price_volatility=0.02,
            num_epochs=120,
        ),
        num_epochs=120,
    )


def floor_depletion() -> ProtocolParams:
    """Massive redemptions drain floor reserve, impact token liquidity dries up."""
    return ProtocolParams(
        staking=StakingParams(
            initial_price=9.0,
            initial_nav_per_shit=0.0,
            initial_floor_price=0.0,
            initial_staking_ratio=0.60,
            price_drift=-0.002,
            price_volatility=0.05,
            num_epochs=120,
        ),
        treasury=TreasuryParams(
            initial_usdc=0.0,
            initial_morpho=0.0,
            initial_impact_tokens=0.0,
            initial_pol=0.0,
            impact_haircut_bps=7000,  # 70% haircut — liquidity crisis
            pol_haircut_bps=7000,
            num_epochs=120,
        ),
        floor_hook=FloorHookParams(
            initial_floor_reserve=0.0,
            initial_band_reserve=0.0,
            base_buy_volume_usdc=20_000.0,
            base_sell_volume_shit=20_000.0,
            redemption_probability=0.5,
            redemption_size_pct=0.20,
            num_epochs=120,
        ),
        bonding=BondingParams(num_epochs=120),
        stablecoin=StablecoinParams(num_epochs=120),
        num_epochs=120,
    )


def stablecoin_depeg() -> ProtocolParams:
    """USDC depegs, Bucky peg breaks, AMO positions liquidated, treasury USDC impaired."""
    return ProtocolParams(
        staking=StakingParams(
            initial_price=10.0,
            initial_nav_per_shit=0.0,
            initial_floor_price=0.0,
            price_volatility=0.08,
            num_epochs=120,
        ),
        treasury=TreasuryParams(
            initial_usdc=0.0,
            initial_morpho=0.0,
            initial_impact_tokens=0.0,
            initial_pol=0.0,
            num_epochs=120,
        ),
        floor_hook=FloorHookParams(
            initial_floor_reserve=0.0,
            initial_band_reserve=0.0,
            base_buy_volume_usdc=50_000.0,
            base_sell_volume_shit=10_000.0,
            num_epochs=120,
        ),
        bonding=BondingParams(num_epochs=120),
        stablecoin=StablecoinParams(
            initial_bucky_supply=0.0,
            initial_psm_usdc=0.0,
            usdc_depeg_epoch=30,
            usdc_depeg_severity=0.08,
            price_volatility=0.03,
            num_epochs=120,
        ),
        num_epochs=120,
    )


def premium_runaway() -> ProtocolParams:
    """Sustained 3x+ NAV, premium seller mints aggressively, supply dilution."""
    return ProtocolParams(
        staking=StakingParams(
            initial_price=24.0,
            initial_nav_per_shit=0.0,
            initial_floor_price=0.0,
            initial_staking_ratio=0.85,
            price_drift=0.005,
            price_volatility=0.03,
            r_max=45,
            k_bps=17500,
            num_epochs=120,
        ),
        treasury=TreasuryParams(
            initial_usdc=0.0,
            initial_morpho=0.0,
            initial_impact_tokens=0.0,
            initial_pol=0.0,
            num_epochs=120,
        ),
        floor_hook=FloorHookParams(
            initial_floor_reserve=0.0,
            initial_band_reserve=0.0,
            base_buy_volume_usdc=500_000.0,
            base_sell_volume_shit=2_000.0,
            num_epochs=120,
        ),
        bonding=BondingParams(
            premium_threshold=2.0,
            clip_bps=25,
            bond_capacity_per_epoch=20_000.0,
            num_epochs=120,
        ),
        stablecoin=StablecoinParams(num_epochs=120),
        num_epochs=120,
    )


def governance_attack() -> ProtocolParams:
    """Malicious parameter changes: high R_MAX, remove circuit breaker, increase team comp."""
    return ProtocolParams(
        staking=StakingParams(
            initial_price=10.0,
            initial_nav_per_shit=0.0,
            initial_floor_price=0.0,
            r_max=100,  # 1% per epoch — doubled
            k_bps=25000,  # 2.5x — increased
            circuit_breaker_threshold=999,  # Effectively disabled
            initial_staking_ratio=0.70,
            price_volatility=0.05,
            num_epochs=120,
        ),
        treasury=TreasuryParams(
            initial_usdc=0.0,
            initial_morpho=0.0,
            initial_impact_tokens=0.0,
            initial_pol=0.0,
            team_comp_active=True,
            team_comp_rate_bps=500,  # 5% — way above 2% cap
            num_epochs=120,
        ),
        floor_hook=FloorHookParams(
            initial_floor_reserve=0.0,
            initial_band_reserve=0.0,
            num_epochs=120,
        ),
        bonding=BondingParams(num_epochs=120),
        stablecoin=StablecoinParams(num_epochs=120),
        num_epochs=120,
    )


def black_swan() -> ProtocolParams:
    """Combined shock: market crash + stablecoin depeg + impact token illiquidity + POL hack."""
    return ProtocolParams(
        staking=StakingParams(
            initial_price=10.0,
            initial_nav_per_shit=0.0,
            initial_floor_price=0.0,
            initial_staking_ratio=0.70,
            price_drift=-0.02,
            price_volatility=0.15,
            num_epochs=120,
        ),
        treasury=TreasuryParams(
            initial_usdc=0.0,
            initial_morpho=0.0,
            initial_impact_tokens=0.0,
            initial_pol=0.0,
            impact_haircut_bps=8000,  # 80% haircut — near total loss
            pol_haircut_bps=9000,     # 90% haircut — POL hacked
            morpho_apy=0.01,
            impact_token_apy=-0.50,   # Massive loss
            pol_fee_apy=-0.30,        # POL losing value
            num_epochs=120,
        ),
        floor_hook=FloorHookParams(
            initial_floor_reserve=0.0,
            initial_band_reserve=0.0,
            base_buy_volume_usdc=5_000.0,
            base_sell_volume_shit=40_000.0,
            redemption_probability=0.4,
            redemption_size_pct=0.15,
            num_epochs=120,
        ),
        bonding=BondingParams(num_epochs=120),
        stablecoin=StablecoinParams(
            usdc_depeg_epoch=20,
            usdc_depeg_severity=0.12,
            price_volatility=0.05,
            num_epochs=120,
        ),
        num_epochs=120,
    )


def dissolution() -> ProtocolParams:
    """Simulate clean wind-down: verify all holders can redeem at floor."""
    return ProtocolParams(
        staking=StakingParams(
            initial_price=7.5,
            initial_nav_per_shit=0.0,
            initial_floor_price=0.0,
            initial_staking_ratio=0.30,
            price_drift=0.0,
            price_volatility=0.01,
            num_epochs=60,
        ),
        treasury=TreasuryParams(
            initial_usdc=0.0,
            initial_morpho=0.0,
            initial_impact_tokens=0.0,
            initial_pol=0.0,
            team_comp_active=False,
            num_epochs=60,
        ),
        floor_hook=FloorHookParams(
            initial_floor_reserve=0.0,
            initial_band_reserve=0.0,
            base_buy_volume_usdc=10_000.0,
            base_sell_volume_shit=5_000.0,
            redemption_probability=0.8,
            redemption_size_pct=0.15,
            num_epochs=60,
        ),
        bonding=BondingParams(num_epochs=60),
        stablecoin=StablecoinParams(num_epochs=60),
        num_epochs=60,
    )


SCENARIOS = {
    'bull_market': ('Bull Market', bull_market),
    'bear_market': ('Bear Market', bear_market),
    'death_spiral': ('Death Spiral', death_spiral),
    'floor_depletion': ('Floor Depletion', floor_depletion),
    'stablecoin_depeg': ('Stablecoin Depeg', stablecoin_depeg),
    'premium_runaway': ('Premium Runaway', premium_runaway),
    'governance_attack': ('Governance Attack', governance_attack),
    'black_swan': ('Black Swan', black_swan),
    'dissolution': ('Dissolution', dissolution),
}
