"""
Protocol orchestrator — thin wrapper over SHIT Protocol psub.py.
~50 lines. Configures cadCAD Experiment with SHIT-specific PSUB additions.
"""

import sys
sys.path.insert(0, '/tokenomics')

from glue.shit_config import get_shit_params
from glue import floor_hook, bamm_perp, fee_routing, governance, market_structure
from glue import bucky_peg, bucky_dss, bucky_stress
import importlib
yield_glue = importlib.import_module('glue.yield')


def staking_dynamics_policy(params, substep, state_history, previous_state):
    """Compute dynamic staking metrics matching ShitStaking.sol contract."""
    price = previous_state.get('price', 1.0) or 1.0
    supply = max(previous_state.get('supply', 100e6), 1)
    reserves_stables = previous_state.get('reserves_stables', 0) or 0
    current_st_shit = previous_state.get('st_shit_supply', 5e6) or 5e6
    current_rebase_index = previous_state.get('rebase_index', 1.0)
    current_epoch = previous_state.get('timestep', 0)

    p = params if isinstance(params, dict) else {}
    cb_threshold = p.get('circuitBreakerThreshold', 21)
    r_max = p.get('rMax', 55)
    k_bps = p.get('kBps', 14000)
    rebase_cap_bps = p.get('rebaseRateCapBps', 45)  # Protocol hard cap: 0.45% max rebase per epoch
    staking_gate_bps = p.get('stakingRatioGateBps', 5000)
    cb_auto_reset = p.get('cbAutoReset', 21)
    cb_soft_reset_threshold = p.get('cbSoftResetThreshold', 7)
    cb_soft_reset_epochs = p.get('cbSoftResetEpochs', 60)
    cb_forced_reset_epochs = p.get('cbForcedResetEpochs', 55)
    smoothing_divert_bps = p.get('smoothingDivertBps', 3000)
    smoothing_floor_bps = p.get('smoothingFloorBps', 10)
    smoothing_buffer_cap_bps = p.get('smoothingBufferCapBps', 5000)
    supp_rate_limit_window = p.get('suppRateLimitWindow', 30)
    supp_rate_limit_cap_bps = p.get('suppRateLimitCapBps', 500)
    supp_warmup_epochs = p.get('suppWarmupEpochs', 30)
    rfv_invariant_min = p.get('rfvInvariantMin', 0.90)
    deployment_grace = p.get('deploymentGracePeriod', 504)

    # --- NAV and RFV (TreasuryValuation.sol) ---
    floor_r = previous_state.get('floor_reserve', 0) or 0
    band_r = previous_state.get('band_reserve', 0) or 0
    pol_v = previous_state.get('pol_value', 0) or 0
    yield_c = previous_state.get('yield_capital', 0) or 0
    total_value = reserves_stables + floor_r + band_r + pol_v + yield_c
    nav_per_token = total_value / supply if supply > 0 else 0
    # RFV with whitepaper haircuts: stables 100%, floor reserve 100%, band 90%,
    # POL and yield use configurable haircuts from UI sliders
    impact_haircut = p.get('impactHaircutBps', 5000) / 10000.0
    pol_haircut = p.get('polHaircutBps', 5000) / 10000.0
    rfv = (reserves_stables * 1.0 + floor_r * 1.0 + band_r * 0.90 +
           pol_v * (1.0 - pol_haircut) + yield_c * (1.0 - impact_haircut))
    floor_price = rfv / supply if supply > 0 else 0

    # --- Staking ratio dynamics ---
    staking_ratio = current_st_shit / supply if supply > 0 else 0
    ma_target = previous_state.get('ma_target', price) or price
    market_premium = price / ma_target if ma_target > 0 else 1.0

    # Continuous target staking ratio — smooth transition across premium levels
    # instead of discrete if/elif jumps (avoids staircase in staking ratio chart)
    # Maps market_premium [0.5 .. 1.5] → target_stake_ratio [0.20 .. 0.85]
    if market_premium <= 0.5:
        target_stake_ratio = 0.20
    elif market_premium >= 1.5:
        target_stake_ratio = 0.85
    else:
        # Linear interpolation between bear (0.20 at 0.5x) and bull (0.85 at 1.5x)
        target_stake_ratio = 0.20 + (market_premium - 0.5) * (0.85 - 0.20) / (1.5 - 0.5)

    # Faster convergence: 5% per epoch toward target
    new_staking_ratio = staking_ratio + (target_stake_ratio - staking_ratio) * 0.05
    new_staking_ratio = max(0.02, min(0.95, new_staking_ratio))
    st_shit = new_staking_ratio * supply

    # --- Base yield from harvested POL fees + gauge emissions ---
    base_yield = (pol_v * 0.001 + yield_c * 0.001) / max(st_shit, 1)
    base_yield = max(0.00001, min(0.001, base_yield))

    # --- Circuit breaker (ShitStaking.sol:314-355) ---
    prev_cb_tripped = previous_state.get('circuit_breaker_tripped', False)
    prev_cb_count = previous_state.get('circuit_breaker_count', 0)
    prev_cb_trip_epoch = previous_state.get('circuit_breaker_trip_epoch', 0)
    prev_cb_recovery_count = previous_state.get('circuit_breaker_recovery_count', 0)
    in_grace = current_epoch < deployment_grace

    new_cb_tripped = prev_cb_tripped
    new_cb_count = prev_cb_count
    new_cb_recovery_count = prev_cb_recovery_count
    new_cb_trip_epoch = prev_cb_trip_epoch

    # Forced reset (tripped >= 55 epochs)
    if prev_cb_tripped:
        epochs_tripped = current_epoch - prev_cb_trip_epoch
        if epochs_tripped >= cb_forced_reset_epochs:
            new_cb_tripped = False
            new_cb_count = 0
            new_cb_recovery_count = 0

    rbs_floor = previous_state.get('lower_target_wall', floor_price) or floor_price
    if floor_price > 0 and price < floor_price and not in_grace:
        if not new_cb_tripped:
            new_cb_count = min(prev_cb_count + 1, cb_threshold * 3)
            new_cb_recovery_count = 0
            if new_cb_count >= cb_threshold and not new_cb_tripped:
                new_cb_tripped = True
                new_cb_trip_epoch = current_epoch
    elif new_cb_tripped:
        if price >= floor_price:
            new_cb_recovery_count = prev_cb_recovery_count + 1
            epochs_tripped = current_epoch - prev_cb_trip_epoch
            effective_reset = (cb_soft_reset_threshold if epochs_tripped > cb_soft_reset_epochs
                               else cb_auto_reset)
            if new_cb_recovery_count >= effective_reset:
                new_cb_tripped = False
                new_cb_count = 0
                new_cb_recovery_count = 0
        else:
            new_cb_recovery_count = 0
    elif not in_grace:
        new_cb_count = 0

    # --- Supplemental emissions (ShitStaking.sol:357-431) ---
    smoothing_buffer = previous_state.get('smoothing_buffer', 0) or 0
    supp_window_minted = previous_state.get('supp_window_minted', 0) or 0
    supp_window_start = previous_state.get('supp_window_start', 0) or 0

    supplemental = 0.0
    staking_ratio_bps = int(new_staking_ratio * 10000)

    if price > nav_per_token and not new_cb_tripped and staking_ratio_bps > staking_gate_bps:
        # When NAV is very low (treasury just starting), premium_bps can be
        # extremely large, causing a sudden spike in supplemental emissions.
        # Ramp supplemental emissions gradually during early epochs using a
        # linear warmup factor so APY doesn't jump vertically.
        nav_warmup_epochs = p.get('navWarmupEpochs', 50)
        nav_warmup_factor = min(1.0, current_epoch / nav_warmup_epochs) if current_epoch < nav_warmup_epochs else 1.0
        premium_bps = int(price * 10000 / nav_per_token) if nav_per_token > 0 else 10000
        range_bps = k_bps - 10000  # 4000

        if premium_bps >= k_bps:
            supplemental = supply * r_max / 10000.0
        elif premium_bps > 10000 and range_bps > 0:
            excess_bps = premium_bps - 10000
            supplemental = supply * r_max * excess_bps / (range_bps * 10000.0)
        else:
            supplemental = 0.0

        # Apply warmup ramp to prevent sudden APY spike when treasury first grows
        supplemental *= nav_warmup_factor

        # RFV invariant check (ShitStaking.sol:374-395)
        if supplemental > 0 and floor_price > 0:
            new_supply = supply + supplemental
            required_rfv = new_supply * floor_price
            if rfv < required_rfv:
                backing_ratio = rfv / required_rfv if required_rfv > 0 else 0
                if rfv_invariant_min <= backing_ratio < 1.0:
                    supplemental = supplemental * (backing_ratio - rfv_invariant_min) / (1.0 - rfv_invariant_min)
                else:
                    supplemental = 0

        # Rate limiter (ShitStaking.sol:397-409)
        if current_epoch >= supp_warmup_epochs and supplemental > 0:
            if current_epoch - supp_window_start >= supp_rate_limit_window:
                supp_window_start = current_epoch
                supp_window_minted = 0
            window_cap = supply * supp_rate_limit_cap_bps / 10000.0
            remaining_cap = max(0, window_cap - supp_window_minted)
            supplemental = min(supplemental, remaining_cap)

        # Reward smoothing: divert to buffer (ShitStaking.sol:412-422)
        if supplemental > 0:
            to_buffer = supplemental * smoothing_divert_bps / 10000.0
            buffer_cap = supply * smoothing_buffer_cap_bps / 10000.0
            if smoothing_buffer + to_buffer > buffer_cap:
                to_buffer = max(0, buffer_cap - smoothing_buffer)
            if to_buffer > 0:
                supplemental -= to_buffer
                smoothing_buffer += to_buffer

    # Reward smoothing: draw from buffer (ShitStaking.sol:434-449)
    if supplemental == 0 and smoothing_buffer > 0:
        from_buffer = supply * smoothing_floor_bps / 10000.0
        from_buffer = min(from_buffer, smoothing_buffer)
        if from_buffer > 0:
            smoothing_buffer -= from_buffer
            supplemental = from_buffer
            supp_window_minted += supplemental

    if supplemental > 0:
        supp_window_minted += supplemental

    # --- Total rebase rate = base yield + supplemental per staker ---
    raw_rebase = base_yield + (supplemental / max(st_shit, 1) if st_shit > 0 else 0)
    # Rebase rate cap (ShitStaking.sol:451-462)
    rebase_cap = rebase_cap_bps / 10000.0
    raw_rebase = min(raw_rebase, rebase_cap)

    # Smooth rebase rate: limit per-epoch change to 10% of previous value
    # This prevents sharp APY jumps from supplemental toggling on/off
    prev_rebase = previous_state.get('reward_rate', 0.000198) or 0.000198
    max_change = abs(prev_rebase) * 0.10 + 0.00001  # 10% change + small floor
    if raw_rebase > prev_rebase + max_change:
        total_rebase = prev_rebase + max_change
    elif raw_rebase < prev_rebase - max_change:
        total_rebase = prev_rebase - max_change
    else:
        total_rebase = raw_rebase
    total_rebase = max(0.00001, min(total_rebase, rebase_cap))

    new_rebase_index = current_rebase_index * (1 + total_rebase)

    return {
        'dynamic_reward_rate': total_rebase,
        'st_shit_supply': st_shit,
        'rebase_index': new_rebase_index,
        'circuit_breaker_count': new_cb_count,
        'circuit_breaker_tripped': new_cb_tripped,
        'circuit_breaker_trip_epoch': new_cb_trip_epoch,
        'circuit_breaker_recovery_count': new_cb_recovery_count,
        'supplemental_mint': supplemental,
        'smoothing_buffer': smoothing_buffer,
        'supp_window_minted': supp_window_minted,
        'supp_window_start': supp_window_start,
        'nav_per_shit': nav_per_token,
        'shit_supply': supply,
    }


def build_partial_state_updates(params):
    """Build PSUB list: SHIT Protocol base + SHIT extensions."""
    # SHIT Protocol base PSUBs (imported from oss.shit-protocol.psub)
    try:
        from oss.shit-protocol.psub import psub_blocks as shit_psubs
        psubs = list(shit_psubs)
    except Exception:
        psubs = []

    # SHIT-specific PSUBs appended after SHIT Protocol base
    # cadCAD SUF signature: (params, substep, state_history, state, _input)
    shit_psubs = [
        # Staking dynamics — must run first so other PSUBs see updated values
        {
            'policies': {
                'staking_dynamics': staking_dynamics_policy
            },
            'variables': {
                'reward_rate': lambda p, sub, h, s, _input: ('reward_rate', _input.get('dynamic_reward_rate', s.get('reward_rate', 0.000198))),
                'st_shit_supply': lambda p, sub, h, s, _input: ('st_shit_supply', _input.get('st_shit_supply', s.get('st_shit_supply', 50e6))),
                'rebase_index': lambda p, sub, h, s, _input: ('rebase_index', _input.get('rebase_index', s.get('rebase_index', 1.0))),
                'circuit_breaker_count': lambda p, sub, h, s, _input: ('circuit_breaker_count', _input.get('circuit_breaker_count', 0)),
                'circuit_breaker_tripped': lambda p, sub, h, s, _input: ('circuit_breaker_tripped', _input.get('circuit_breaker_tripped', False)),
                'circuit_breaker_trip_epoch': lambda p, sub, h, s, _input: ('circuit_breaker_trip_epoch', _input.get('circuit_breaker_trip_epoch', 0)),
                'circuit_breaker_recovery_count': lambda p, sub, h, s, _input: ('circuit_breaker_recovery_count', _input.get('circuit_breaker_recovery_count', 0)),
                'supplemental_mint': lambda p, sub, h, s, _input: ('supplemental_mint', _input.get('supplemental_mint', 0)),
                'smoothing_buffer': lambda p, sub, h, s, _input: ('smoothing_buffer', _input.get('smoothing_buffer', 0)),
                'supp_window_minted': lambda p, sub, h, s, _input: ('supp_window_minted', _input.get('supp_window_minted', 0)),
                'supp_window_start': lambda p, sub, h, s, _input: ('supp_window_start', _input.get('supp_window_start', 0)),
                'nav_per_shit': lambda p, sub, h, s, _input: ('nav_per_shit', _input.get('nav_per_shit', 0)),
                'shit_supply': lambda p, sub, h, s, _input: ('shit_supply', _input.get('shit_supply', s.get('supply', 100e6))),
            }
        },
        {
            'policies': {
                'floor_hook_policy': floor_hook.floor_hook_policy
            },
            'variables': {
                'floor_reserve': lambda p, sub, h, s, _input: ('floor_reserve', max(0, s.get('floor_reserve', 0) + _input.get('floor_fees', 0) - _input.get('redemption_value', 0))),
                'band_reserve': lambda p, sub, h, s, _input: ('band_reserve', s.get('band_reserve', 0) + _input.get('band_fees', 0)),
                'shit_supply': lambda p, sub, h, s, _input: ('shit_supply', max(0, s.get('shit_supply', s.get('supply', 100e6)) - _input.get('shit_absorbed', 0) - _input.get('redemption_shit', 0))),
            }
        },
        {
            'policies': {
                'bamm_perp_policy': bamm_perp.bamm_perp_policy
            },
            'variables': {
                'bamm_vault_assets': lambda p, sub, h, s, _input: ('bamm_vault_assets', _input.get('bamm_vault_assets', s.get('bamm_vault_assets', 0))),
                'bamm_vault_shares': lambda p, sub, h, s, _input: ('bamm_vault_shares', _input.get('bamm_vault_shares', s.get('bamm_vault_shares', 1e18))),
                'bamm_vault_liabilities': lambda p, sub, h, s, _input: ('bamm_vault_liabilities', _input.get('bamm_vault_liabilities', s.get('bamm_vault_liabilities', 0))),
                'perp_open_interest': lambda p, sub, h, s, _input: ('perp_open_interest', _input.get('perp_open_interest', s.get('perp_open_interest', 0))),
                'perp_funding_accum': lambda p, sub, h, s, _input: ('perp_funding_accum', _input.get('perp_funding_accum', s.get('perp_funding_accum', 0))),
            }
        },
        {
            'policies': {
                'fee_routing_policy': fee_routing.fee_routing_policy
            },
            'variables': {
                'pol_value': lambda p, sub, h, s, _input: ('pol_value', s.get('pol_value', 0) + _input.get('pol_fees', 0)),
                'yield_capital': lambda p, sub, h, s, _input: ('yield_capital', s.get('yield_capital', 0) + _input.get('yield_fees', 0)),
            }
        },
        {
            'policies': {
                'governance_policy': governance.governance_policy
            },
            'variables': {
                'pending_onboarding': lambda p, sub, h, s, _input: ('pending_onboarding', _input.get('pending_onboarding', s.get('pending_onboarding', []))),
            }
        },
        {
            'policies': {
                'market_structure_policy': market_structure.market_structure_policy
            },
            'variables': {
                'pol_value': lambda p, sub, h, s, _input: ('pol_value', s.get('pol_value', 0) + _input.get('pol_inflow', 0) - _input.get('pol_outflow', 0)),
            }
        },
        {
            'policies': {
                'yield_policy': yield_glue.yield_policy
            },
            'variables': {
                'wst_shit_supply': lambda p, sub, h, s, _input: ('wst_shit_supply', _input.get('wst_shit_supply', s.get('wst_shit_supply', 10e6))),
                'yield_capital': lambda p, sub, h, s, _input: ('yield_capital', s.get('yield_capital', 0) + _input.get('yield_generated', 0)),
                'pendle_py_index': lambda p, sub, h, s, _input: ('pendle_py_index', _input.get('pendle_py_index', s.get('pendle_py_index', 1.0))),
                'pendle_stress_gap': lambda p, sub, h, s, _input: ('pendle_stress_gap', _input.get('pendle_stress_gap', 0)),
                'pendle_implied_apy': lambda p, sub, h, s, _input: ('pendle_implied_apy', _input.get('pendle_implied_apy', 0)),
                'pendle_pt_price': lambda p, sub, h, s, _input: ('pendle_pt_price', _input.get('pendle_pt_price', 1.0)),
            }
        },
        # --- Bucky peg stability (Curve PegKeeper) ---
        {
            'policies': {
                'bucky_peg_policy': bucky_peg.bucky_peg_policy
            },
            'variables': {
                'bucky_price': lambda p, sub, h, s, _input: ('bucky_price', _input.get('bucky_price', 1.0)),
                'bucky_peg_deviation': lambda p, sub, h, s, _input: ('bucky_peg_deviation', _input.get('bucky_peg_deviation', 0)),
                'pegkeeper_profit': lambda p, sub, h, s, _input: ('pegkeeper_profit', _input.get('pegkeeper_profit', 0)),
            }
        },
        # --- Bucky CDP (Liquity economic model) ---
        {
            'policies': {
                'bucky_dss_policy': bucky_dss.bucky_dss_policy
            },
            'variables': {
                'bucky_tcr': lambda p, sub, h, s, _input: ('bucky_tcr', _input.get('bucky_tcr', 0)),
                'bucky_active_debt': lambda p, sub, h, s, _input: ('bucky_active_debt', _input.get('bucky_active_debt', 0)),
                'bucky_stability_pool_size': lambda p, sub, h, s, _input: ('bucky_stability_pool_size', _input.get('bucky_stability_pool_size', 0)),
                'bucky_liquidations': lambda p, sub, h, s, _input: ('bucky_liquidations', _input.get('bucky_liquidations', 0)),
            }
        },
        # --- Bucky stress test (crvUSD risk model) ---
        {
            'policies': {
                'bucky_stress_policy': bucky_stress.bucky_stress_policy
            },
            'variables': {
                'bucky_stress_price': lambda p, sub, h, s, _input: ('bucky_stress_price', _input.get('bucky_stress_price', 1.0)),
                'bucky_stress_tcr': lambda p, sub, h, s, _input: ('bucky_stress_tcr', _input.get('bucky_stress_tcr', 0)),
                'bucky_stress_peg_dev': lambda p, sub, h, s, _input: ('bucky_stress_peg_dev', _input.get('bucky_stress_peg_dev', 0)),
                'bucky_stress_liq_count': lambda p, sub, h, s, _input: ('bucky_stress_liq_count', _input.get('bucky_stress_liq_count', 0)),
            }
        },
    ]

    return psubs + shit_psubs


def simulate(params_override=None, n_runs=1):
    """Run the full SHIT Protocol simulation."""
    params = get_shit_params()
    if params_override:
        params.update(params_override)
    params['N'] = n_runs

    psubs = build_partial_state_updates(params)

    try:
        from cadCAD.configuration import Experiment
        from cadCAD.configuration.utils import config_sim
        from cadCAD.engine import ExecutionContext, Executor
        from oss.shit-protocol.utility.default_parameters import default_params1
        from oss.shit-protocol.utility.default_initial_state import default_initial_state1
        from oss.shit-protocol.utility.initial_state_functions import fill_in_initial_state

        # Start with SHIT Protocol defaults, override with SHIT params
        # Keep params as lists for cadCAD M (it expects sweep format)
        shit_params = dict(default_params1)
        # Unwrap single-element lists for SHIT overrides
        for k, v in params.items():
            shit_params[k] = [v] if not isinstance(v, list) else v

        initial_state = dict(default_initial_state1)
        initial_state.update({
            'price': 1.0, 'supply': 100e6,
            'ma_target': 1.0,  # Match initial price (SHIT Protocol default was 9.5)
            'liq_stables': 5e6,  # Seed AMM liquidity for price discovery
            'reserves_stables': 0,  # Start at 0, grows from fee revenue
            'shit_supply': 100e6, 'st_shit_supply': 5e6,  # 5% initial staking
            'wst_shit_supply': 1e6, 'rebase_index': 1.0,
            'floor_reserve': 0, 'band_reserve': 0,  # Start at 0, grows from floor hook fees
            'pol_value': 0, 'yield_capital': 0,  # Start at 0, grows from POL fees + yield
            'bamm_vault_assets': 0, 'bamm_vault_shares': 1e18,
            'bamm_vault_liabilities': 0, 'perp_open_interest': 0,
            'perp_funding_accum': 0,
            'pending_onboarding': [],
            'circuit_breaker_count': 0, 'circuit_breaker_tripped': False,
            'circuit_breaker_trip_epoch': 0, 'circuit_breaker_recovery_count': 0,
            'supplemental_mint': 0, 'nav_per_shit': 0,
            'smoothing_buffer': 0, 'supp_window_minted': 0, 'supp_window_start': 0,
            # SHIT-specific state variables
            'floor_hook_state': {'accumulated_fees': 0, 'floor_price': 1.0},
            'bamm_perp_state': {'vault_assets': 0, 'vault_shares': 1e18,
                                'vault_liabilities': 0, 'open_interest': 0,
                                'funding_accum': 0},
            'fee_routing_state': {'shit_burned': 0, 'treasury_fees': 0,
                                  'staker_fees': 0},
            'governance_state': {'referral_volume': 0, 'onboarded_tokens': []},
            'market_structure_state': {'lbp_proceeds': 0, 'impact_allocations': {}},
            'yield_state': {'wst_shit_supply': 10e6, 'yield_accumulated': 0},
            # Bucky / Pendle OSS integration state
            'bucky_price': 1.0, 'bucky_peg_deviation': 0,
            'pegkeeper_profit': 0,
            'bucky_tcr': 0, 'bucky_active_debt': 0,
            'bucky_stability_pool_size': 0, 'bucky_liquidations': 0,
            'bucky_stress_price': 1.0, 'bucky_stress_tcr': 0,
            'bucky_stress_peg_dev': 0, 'bucky_stress_liq_count': 0,
            'pendle_py_index': 1.0, 'pendle_stress_gap': 0,
            'pendle_implied_apy': 0, 'pendle_pt_price': 1.0,
        })
        # Compute derived state variables (treasury_stables, amm_k, liq_shit, etc.)
        initial_state = fill_in_initial_state(initial_state, shit_params)

        sim_config = config_sim({
            'N': n_runs,
            'T': list(range(params['T'])),
            'M': shit_params,
        })

        exp = Experiment()
        exp.append_configs(
            sim_configs=sim_config,
            initial_state=initial_state,
            partial_state_update_blocks=psubs,
        )

        exec_context = ExecutionContext()
        executor = Executor(exec_context=exec_context, configs=exp.configs)
        results = executor.execute()
        # Return raw events (first element of the tuple)
        if isinstance(results, tuple) and len(results) >= 1:
            return results[0]
        return results
    except Exception as e:
        import traceback
        return {'error': str(e), 'traceback': traceback.format_exc()}
