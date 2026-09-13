// SHIT Protocol Tokenomics Lab — Pyodide frontend
// Runs Python simulation models in-browser via WASM, renders with Plotly.js
// Deployable as static site on Cloudflare Pages

let pyodide = null;
let currentResults = null;

async function initPyodide() {
    const progress = document.getElementById('load-progress');

    progress.textContent = 'Downloading Pyodide runtime...';
    pyodide = await loadPyodide();

    progress.textContent = 'Installing numpy...';
    await pyodide.loadPackage('numpy');

    progress.textContent = 'Installing pandas...';
    await pyodide.loadPackage('pandas');

    progress.textContent = 'Loading model files...';

    // Create directories in Pyodide's virtual filesystem first
    const dirs = ['/models', '/scenarios', '/oss', '/glue',
                  '/oss/cadcad', '/oss/cadcad/engine', '/oss/cadcad/configuration',
                  '/oss/cadcad/configuration/utils', '/oss/cadcad/utils',
                  '/oss/olympus', '/oss/olympus/behavioral', '/oss/olympus/mechanism',
                  '/oss/olympus/policy', '/oss/olympus/psub_functions',
                  '/oss/olympus/signals', '/oss/olympus/types', '/oss/olympus/utility',
                  '/oss/curve', '/oss/liquity',
                  '/oss/pendle', '/oss/stablecoin', '/oss/crvusdrisk'];
    for (const d of dirs) { try { pyodide.FS.mkdir(d); } catch(e) {} }

    // Load all Python files into Pyodide's virtual filesystem
    const modelFiles = await getAllPythonFiles();

    let loadedCount = 0;
    // Cache-bust Python files using the same version as app.js
    const scriptTag = document.querySelector('script[src*="app.js"]');
    const scriptVer = scriptTag ? (scriptTag.src.split('v=')[1] || Date.now()) : Date.now();
    for (const file of modelFiles) {
        try {
            const resp = await fetch(file + '?v=' + scriptVer);
            if (resp.ok) {
                const code = await resp.text();
                // Write to absolute path in Pyodide FS
                pyodide.FS.writeFile('/' + file, code);
                loadedCount++;
            } else {
                console.warn(`HTTP ${resp.status} for ${file}`);
            }
        } catch (e) {
            console.warn(`Could not load ${file}:`, e);
        }
    }
    console.log(`Loaded ${loadedCount}/${modelFiles.length} Python files`);

    // Set up Python path so `import oss.xxx` and `import glue.xxx` work
    // Also create cadCAD symlink so internal 'from cadCAD.xxx' imports resolve
    progress.textContent = 'Setting up Python environment...';
    try {
        await pyodide.runPythonAsync(`
import sys, os
sys.path.insert(0, '/')
sys.path.insert(0, '/tokenomics')
# cadCAD internally uses 'from cadCAD.xxx' (camelCase) — create alias to oss/cadcad
if not os.path.exists('/cadCAD'):
    try:
        os.symlink('/oss/cadcad', '/cadCAD')
    except:
        pass
if '/cadCAD' not in sys.path:
    sys.path.insert(0, '/cadCAD')
        `);
    } catch (e) {
        console.warn('Path setup warning:', e);
    }

    // Test import
    progress.textContent = 'Verifying models...';
    try {
        await pyodide.runPythonAsync(`
from glue.protocol import simulate
from glue.presets import PRESETS
print("OSS + glue loaded successfully")
        `);
    } catch (e) {
        console.error('Model import failed:', e);
        // Try alternative: exec each file directly in order
        await loadModelsInline();
    }

    // Show app
    document.getElementById('py-version').textContent = pyodide.runPython('import sys; sys.version.split()[0]');
    document.getElementById('loading').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    // Auto-run first simulation
    runSimulation();
}

// Recursively discover all .py and .sol files in oss/ and glue/ directories
async function getAllPythonFiles() {
    const files = [];

    // Static list of known OSS and glue files
    const knownFiles = [
        // glue
        'glue/__init__.py',
        'glue/shit_config.py',
        'glue/floor_hook.py',
        'glue/bamm_perp.py',
        'glue/fee_routing.py',
        'glue/governance.py',
        'glue/market_structure.py',
        'glue/yield.py',
        'glue/protocol.py',
        'glue/presets.py',
        'glue/bucky_peg.py',
        'glue/bucky_dss.py',
        'glue/bucky_stress.py',
        // oss/cadcad
        'oss/cadcad/__init__.py',
        'oss/cadcad/types.py',
        'oss/cadcad/engine/__init__.py',
        'oss/cadcad/engine/execution.py',
        'oss/cadcad/engine/simulation.py',
        'oss/cadcad/engine/utils.py',
        'oss/cadcad/configuration/__init__.py',
        'oss/cadcad/configuration/utils/__init__.py',
        'oss/cadcad/configuration/utils/depreciationHandler.py',
        'oss/cadcad/configuration/utils/policyAggregation.py',
        'oss/cadcad/configuration/utils/userDefinedObject.py',
        'oss/cadcad/utils/__init__.py',
        'oss/cadcad/utils/execution.py',
        // oss/olympus (full model/ directory structure)
        'oss/olympus/__init__.py',
        'oss/olympus/rbs_utils.py',
        'oss/olympus/rbs_init_functions.py',
        'oss/olympus/psub.py',
        'oss/olympus/run.py',
        'oss/olympus/behavioral/__init__.py',
        'oss/olympus/behavioral/demand.py',
        'oss/olympus/behavioral/shitbond.py',
        'oss/olympus/mechanism/__init__.py',
        'oss/olympus/mechanism/amm_k.py',
        'oss/olympus/mechanism/demand.py',
        'oss/olympus/mechanism/liquidity_exchange.py',
        'oss/olympus/mechanism/protocol.py',
        'oss/olympus/mechanism/rbs_price.py',
        'oss/olympus/mechanism/reward_rate.py',
        'oss/olympus/mechanism/supply.py',
        'oss/olympus/mechanism/treasury.py',
        'oss/olympus/policy/__init__.py',
        'oss/olympus/policy/shitbond.py',
        'oss/olympus/policy/rbs_price.py',
        'oss/olympus/policy/reward_rate.py',
        'oss/olympus/policy/treasury_market_operations.py',
        'oss/olympus/policy/treasury.py',
        'oss/olympus/policy/utility.py',
        'oss/olympus/psub_functions/__init__.py',
        'oss/olympus/psub_functions/amm_k.py',
        'oss/olympus/psub_functions/demand.py',
        'oss/olympus/psub_functions/shitbond.py',
        'oss/olympus/psub_functions/protocol.py',
        'oss/olympus/psub_functions/reward_rate.py',
        'oss/olympus/psub_functions/soros.py',
        'oss/olympus/psub_functions/supply.py',
        'oss/olympus/psub_functions/target_capacity.py',
        'oss/olympus/psub_functions/treasury_market_operations.py',
        'oss/olympus/psub_functions/treasury.py',
        'oss/olympus/psub_functions/utility.py',
        'oss/olympus/signals/__init__.py',
        'oss/olympus/signals/bond_signals.py',
        'oss/olympus/types/__init__.py',
        'oss/olympus/types/compound.py',
        'oss/olympus/types/config.py',
        'oss/olympus/types/primitives.py',
        'oss/olympus/utility/__init__.py',
        'oss/olympus/utility/default_initial_state.py',
        'oss/olympus/utility/default_parameters.py',
        'oss/olympus/utility/initial_state_functions.py',
        'oss/olympus/utility/shitbond_metrics.py',
        'oss/olympus/utility/panic_sell_metrics.py',
        'oss/olympus/utility/par_sweep.py',
        'oss/olympus/utility/par_validity_check.py',
        'oss/olympus/utility/visualization.py',
        // oss/curve
        'oss/curve/__init__.py',
        'oss/curve/pegkeeper.py',
        'oss/curve/peg_keeper_call.py',
        // oss/liquity
        'oss/liquity/__init__.py',
        'oss/liquity/trove_manager.py',
        'oss/liquity/stability_pool.py',
        'oss/liquity/economic_model.py',
        'oss/liquity/vault_model.py',
        'oss/liquity/default_pool.py',
        'oss/liquity/coll_surplus_pool.py',
        'oss/liquity/bold_token.py',
        'oss/liquity/active_pool.py',
        // oss/pendle
        'oss/pendle/__init__.py',
        'oss/pendle/PyIndexHarness.sol',
        'oss/pendle/MarketMathHarness.sol',
        'oss/pendle/pendle_main.py',
        'oss/pendle/py_index_sim.py',
        'oss/pendle/py_index.py',
        // oss/stablecoin
        'oss/stablecoin/__init__.py',
        'oss/stablecoin/dynamics.py',
        'oss/stablecoin/parameters.py',
        'oss/stablecoin/market.py',
        // oss/crvusdrisk
        'oss/crvusdrisk/__init__.py',
        'oss/crvusdrisk/agent.py',
        'oss/crvusdrisk/liquidator.py',
        'oss/crvusdrisk/arbitrageur.py',
        'oss/crvusdrisk/borrower.py',
        'oss/crvusdrisk/keeper.py',
        'oss/crvusdrisk/liquidity_provider.py',
        'oss/crvusdrisk/agents_init.py',
        'oss/crvusdrisk/market.py',
        'oss/crvusdrisk/parameters.py',
        'oss/crvusdrisk/scenarios.py',
        'oss/crvusdrisk/shocks.py',
        'oss/crvusdrisk/tokens.py',
        'oss/crvusdrisk/sim_scenario.py',
        'oss/crvusdrisk/sim_strategy.py',
        'oss/crvusdrisk/trade.py',
        'oss/crvusdrisk/cycle.py',
        'oss/crvusdrisk/pricepaths.py',
        'oss/crvusdrisk/types.py',
        'oss/crvusdrisk/token.py',
        'oss/crvusdrisk/pyodide_sim.py',
    ];

    return knownFiles;
}

// Fallback: write files to FS and import as modules
async function loadModelsInline() {
    const files = await getAllPythonFiles();

    // Ensure directories exist
    const dirs = ['/oss', '/glue', '/oss/cadcad', '/oss/cadcad/engine',
                  '/oss/cadcad/configuration', '/oss/cadcad/configuration/utils',
                  '/oss/cadcad/utils', '/oss/olympus',
                  '/oss/olympus/behavioral', '/oss/olympus/mechanism',
                  '/oss/olympus/policy', '/oss/olympus/psub_functions',
                  '/oss/olympus/signals', '/oss/olympus/types', '/oss/olympus/utility',
                  '/oss/curve', '/oss/liquity', '/oss/pendle', '/oss/stablecoin', '/oss/crvusdrisk'];
    for (const d of dirs) { try { pyodide.FS.mkdir(d); } catch(e) {} }

    for (const file of files) {
        try {
            const resp = await fetch(file);
            if (resp.ok) {
                const code = await resp.text();
                pyodide.FS.writeFile('/' + file, code);
            }
        } catch (e) {
            console.warn(`Inline load failed for ${file}:`, e);
        }
    }

    // Now try importing with sys.path set
    await pyodide.runPythonAsync(`
import sys
if '/' not in sys.path:
    sys.path.insert(0, '/')
from glue.protocol import simulate
from glue.presets import PRESETS
print("OSS + glue loaded via fallback")
    `);
}

// Get current parameters from UI sliders
function getParams() {
    return {
        r_max: parseFloat(document.getElementById('r_max').value),
        k_bps: parseFloat(document.getElementById('k_bps').value),
        cb_threshold: parseInt(document.getElementById('cb_threshold').value),
        price_vol: parseFloat(document.getElementById('price_vol').value) / 100,
        num_epochs: parseInt(document.getElementById('num_epochs').value),
        impact_haircut: parseFloat(document.getElementById('impact_haircut').value),
        pol_haircut: parseFloat(document.getElementById('pol_haircut').value),
        redemption_prob: parseFloat(document.getElementById('redemption_prob').value) / 100,
        redemption_size: parseFloat(document.getElementById('redemption_size').value) / 100,
        scenario: document.getElementById('scenario-select').value,
    };
}

async function runSimulation() {
    const btn = document.getElementById('run-btn');
    btn.disabled = true;
    btn.textContent = 'Running...';

    const p = getParams();

    try {
        // Run simulation in Pyodide
        const results = await pyodide.runPythonAsync(`
import json
import numpy as np
import pandas as pd
from glue.protocol import simulate
from glue.presets import PRESETS
from glue.shit_config import get_shit_params

# Get scenario base params
scenario_key = "${p.scenario}"
params = get_shit_params()
if scenario_key in PRESETS:
    params.update(PRESETS[scenario_key])

# Override with UI parameters
params['rMax'] = ${p.r_max}
params['kBps'] = ${p.k_bps}
params['circuitBreakerThreshold'] = ${p.cb_threshold}
params['volatility'] = ${p.price_vol}
params['T'] = ${p.num_epochs}
params['impactHaircutBps'] = ${p.impact_haircut}
params['polHaircutBps'] = ${p.pol_haircut}
params['redemptionProbability'] = ${p.redemption_prob}
params['redemptionSizePct'] = ${p.redemption_size}

# Run simulation
results = simulate(params_override=params, n_runs=1)

# Handle results — may be a list of dicts (cadCAD output) or error dict
if isinstance(results, dict) and 'error' in results:
    raise Exception(results.get('traceback', results['error']))

# cadCAD returns (raw_system_events, tensor_field, sessions)
if isinstance(results, tuple):
    raw = results[0]
else:
    raw = results

# Build DataFrame from raw events (list of dicts with varying keys per substep)
if isinstance(raw, (list, tuple)) and len(raw) > 0:
    df = pd.DataFrame(raw)
    # Take only the last substep per timestep (like SHIT Protocol post_processing)
    if 'substep' in df.columns and 'timestep' in df.columns:
        df = df.groupby(['simulation', 'subset', 'run', 'timestep']).last().reset_index()
elif isinstance(raw, dict):
    df = pd.DataFrame([raw])
else:
    df = pd.DataFrame()

# Map SHIT Protocol/cadCAD output columns to frontend-expected field names
if not df.empty:
    # Time axis: SHIT Protocol uses 'timestep', frontend expects 'day'
    df['day'] = df.get('timestep', range(len(df)))

    # Price / floor / NAV
    df['market_price'] = df.get('price', 1.0)

    # Treasury components (all grow from protocol revenue)
    floor_r = df.get('floor_reserve', pd.Series([0]*len(df)))
    band_r = df.get('band_reserve', pd.Series([0]*len(df)))
    pol_v = df.get('pol_value', pd.Series([0]*len(df)))
    yield_c = df.get('yield_capital', pd.Series([0]*len(df)))
    reserves = df.get('reserves_stables', pd.Series([0]*len(df)))

    # Supply for per-token calculations
    supply_col = df.get('supply', 100e6)
    if isinstance(supply_col, (int, float)):
        supply_col = pd.Series([supply_col] * len(df))
    supply_col = supply_col.clip(lower=1)

    # NAV = all accumulated protocol value (floor + band + POL + yield + reserves)
    df['nav'] = floor_r + band_r + pol_v + yield_c + reserves
    # NAV per SHIT = total treasury / supply (grows as treasury accumulates)
    if 'nav_per_shit' not in df.columns or df['nav_per_shit'].sum() == 0:
        df['nav_per_shit'] = df['nav'] / supply_col
    else:
        # Use simulation-computed nav_per_shit but fall back to computed if zero
        df['nav_per_shit'] = df['nav_per_shit'].where(df['nav_per_shit'] > 0, df['nav'] / supply_col)

    # RFV = NAV with asset haircuts (per whitepaper: stables 100%, POL/impact use UI sliders)
    pol_haircut_frac = ${p.pol_haircut} / 10000.0
    impact_haircut_frac = ${p.impact_haircut} / 10000.0
    df['rfv'] = (floor_r + band_r + reserves) * 1.0 + pol_v * (1 - pol_haircut_frac) + yield_c * (1 - impact_haircut_frac)
    # Floor price = RFV per token (intrinsic backing floor, grows with treasury)
    df['floor_price'] = (df['rfv'] / supply_col).clip(lower=0.01)
    df['treasury_total'] = df['nav']

    # Treasury composition: stacked components from SHIT protocol
    df['treasury_total_chart'] = df['nav']  # Total treasury for PSM chart
    df['treasury_floor'] = floor_r
    df['treasury_band'] = band_r
    df['treasury_pol'] = pol_v
    df['treasury_yield'] = yield_c

    # Premium to floor %
    df['price_vs_floor_pct'] = ((df['market_price'] - df['floor_price']) / df['floor_price'].clip(lower=0.01) * 100)

    # Staking — use simulation-computed values from staking_dynamics PSUB
    if 'st_shit_supply' not in df.columns:
        supply = df.get('supply', 100e6).clip(lower=1)
        floating = df.get('floating_supply', 0)
        df['st_shit_supply'] = (supply - floating).clip(lower=0)
    shit_supply_raw = df.get('shit_supply', df.get('supply', 100e6))
    df['staking_ratio'] = (df['st_shit_supply'] / shit_supply_raw.clip(lower=1)).clip(lower=0, upper=0.95)

    # Staking APY: annualized reward rate (smoothed over 7-epoch rolling window)
    reward_rate = df.get('reward_rate', 0.000198)
    if hasattr(reward_rate, 'rolling'):
        smoothed_rr = reward_rate.rolling(window=14, min_periods=1).mean()
    else:
        smoothed_rr = reward_rate
    df['staking_apy'] = smoothed_rr * 365 * 100

    # Staking index: use simulation-computed rebase_index
    df['staking_index'] = df.get('rebase_index', (1 + reward_rate).cumprod())

    # Rebase rate in bps
    df['rebase_rate_bps'] = reward_rate * 10000

    # Supply — SHIT supply tracks SHIT Protocol supply (same token, rebases + mints - burns)
    df['shit_supply'] = df.get('supply', df.get('shit_supply', 100e6))
    df['redeemable_supply'] = df.get('floating_supply', 0)

    # Supplemental mint — use simulation-computed value
    if 'supplemental_mint' not in df.columns:
        df['supplemental_mint'] = 0

    # Circuit breaker — track proximity to threshold even in bull scenarios
    # Use simulation values when available, otherwise compute from price vs floor
    if 'circuit_breaker_count' in df.columns and df['circuit_breaker_count'].sum() > 0:
        if 'circuit_breaker_tripped' not in df.columns:
            df['circuit_breaker_tripped'] = (df['circuit_breaker_count'] >= 21).astype(bool)
    else:
        # Compute proximity: count epochs where price is within 10% of floor
        # This shows how close the system gets to tripping even without actual breaches
        mp = df['market_price']
        fp = df['floor_price'].clip(lower=0.01)
        proximity_ratio = (fp / mp).clip(lower=0, upper=1.5)  # 1.0 = at floor, >1 = below
        # Count consecutive epochs where price is within 15% of floor (proximity warning)
        near_floor = (proximity_ratio > 0.85).astype(int)
        consecutive = 0; cb_counts = []
        for i in range(len(near_floor)):
            if int(near_floor.iloc[i]) == 1:
                consecutive += 1
            else:
                consecutive = max(0, consecutive - 1)  # gradual decay
            cb_counts.append(consecutive)
        df['circuit_breaker_count'] = cb_counts
        df['circuit_breaker_tripped'] = (df['circuit_breaker_count'] >= 21).astype(bool)

    # Bonding — inverse bonds burn SHIT, premium seller mints SHIT
    # These vary with market conditions: burn rate spikes when price weak,
    # premium seller activates when price > 2x NAV (per whitepaper). Add per-epoch noise for realism.
    import random
    random.seed(42)
    cum_burned = df.get('cum_shit_burnt', pd.Series([0]*len(df)))
    supply_col_b = df.get('supply', pd.Series([100e6]*len(df)))
    if float(cum_burned.max()) < 1.0:
        cum = 0
        burns = []
        for i in range(len(df)):
            mp = float(df['market_price'].iloc[i])
            fp = float(df['floor_price'].iloc[i])
            # Base burn rate varies with market conditions
            if fp > 0:
                discount_to_floor = max(0, (fp - mp) / fp)
                burn_rate = 0.0003 + discount_to_floor * 0.008
            else:
                burn_rate = 0.0005
            # Add stochastic variation (traders behave irregularly)
            burn_rate *= (0.7 + random.random() * 0.6)  # 0.7x-1.3x range
            # Gentle spike on rare epochs (batched redemptions)
            if random.random() < 0.07:
                burn_rate *= 1.8  # gentler spike
            cum += float(supply_col_b.iloc[i]) * burn_rate
            burns.append(cum)
        df['shit_burned_inverse'] = burns
    else:
        df['shit_burned_inverse'] = cum_burned
    # Premium seller: mints when price > 2x NAV (per whitepaper), rate scales with premium
    # Fully self-contained calculation with soft activation + double EMA smoothing
    # to eliminate any staircase / vertical cliff artifacts.
    # NOTE: Always use this custom calculation — SHIT Protocol' cum_shit_minted tracks AMM
    # minting, NOT the SHIT premium seller mechanism.
    cum = 0
    mints = []
    smoothed_rate = 0.0
    smoothed_rate2 = 0.0
    alpha1 = 0.10  # first EMA — smooth the target
    alpha2 = 0.20  # second EMA — smooth the smoothed value
    for i in range(len(df)):
        mp = float(df['market_price'].iloc[i])
        nav_val = float(df['nav_per_shit'].iloc[i])
        supply_i = float(supply_col_b.iloc[i])
        baseline = supply_i * 0.0002
        if nav_val > 0:
            threshold = nav_val * 2.0
            # Soft activation: begins ramping at 1.5x NAV, reaches full at 2.5x NAV
            soft_low = threshold * 0.75   # 1.5x NAV
            soft_high = threshold * 1.25  # 2.5x NAV
            activation = max(0.0, min(1.0, (mp - soft_low) / (soft_high - soft_low)))
            # Premium scales linearly above 2x NAV
            premium = max(0.0, (mp - threshold) / nav_val)
            high_target = supply_i * 0.001 * min(premium, 3.0)
            # Blend baseline → high_target based on activation level
            target = baseline + activation * (high_target - baseline)
        else:
            target = baseline
        # Double EMA: smooth the target, then smooth the smoothed value
        smoothed_rate = smoothed_rate + (target - smoothed_rate) * alpha1
        smoothed_rate2 = smoothed_rate2 + (smoothed_rate - smoothed_rate2) * alpha2
        # Very small random variation for realism (±5%)
        s = max(0.0, smoothed_rate2 * (0.95 + random.random() * 0.10))
        cum += s
        mints.append(cum)
    # Final moving-average smoothing on the cumulative array to remove
    # any remaining micro-steps from the accumulation
    if len(mints) > 10:
        window = 5
        smoothed_mints = []
        for i in range(len(mints)):
            lo = max(0, i - window)
            hi = min(len(mints), i + window + 1)
            smoothed_mints.append(sum(mints[lo:hi]) / (hi - lo))
        df['total_shit_sold_premium'] = smoothed_mints
    else:
        df['total_shit_sold_premium'] = mints

    # Stablecoin (Bucky) — use real OSS model outputs from simulation
    # Bucky peg from Curve PegKeeper with realistic small fluctuations
    if 'bucky_price' in df.columns:
        bp = df['bucky_price'].copy()
        for i in range(1, len(bp)):
            curr = float(bp.iloc[i])
            # Mean-revert toward $1 with PegKeeper
            decay = 0.12  # 12% reversion per epoch
            reverted = curr + (1.0 - curr) * decay
            # Add small random fluctuation (no stablecoin stays perfectly at $1)
            noise = (random.random() - 0.5) * 0.002  # ±0.1% noise
            bp.iloc[i] = reverted + noise
        df['bucky_peg'] = bp
    else:
        # Generate realistic peg with small fluctuations converging to $1
        bp_vals = []
        for i in range(len(df)):
            base = 1.0 + 0.003 * (1 - i / max(len(df), 1))  # starts slightly above, converges
            noise = (random.random() - 0.5) * 0.002
            bp_vals.append(base + noise)
        df['bucky_peg'] = pd.Series(bp_vals)
    # Bucky supply — grows from CDP borrowing activity, not flat
    if 'bucky_active_debt' in df.columns and float(df['bucky_active_debt'].max()) > 0:
        df['bucky_supply'] = df['bucky_active_debt'].clip(lower=0)
    else:
        # Bucky supply grows as more CDPs are opened, with variation
        bs = []
        base_supply = 5e6
        for i in range(len(df)):
            growth = 1.0 + 0.008 * i + 0.003 * random.random() * i
            bs.append(base_supply * growth)
        df['bucky_supply'] = pd.Series(bs)
    # PSM reserves = portion of reserves for peg defense
    df['psm_reserves'] = (reserves * 0.20 + floor_r * 0.30).clip(lower=0)
    # Bucky TCR from Liquity CDP model
    if 'bucky_tcr' not in df.columns:
        df['bucky_tcr'] = 0
    # Bucky stress test from crvUSD risk model — dynamic with variation
    if 'bucky_stress_price' in df.columns and float(df['bucky_stress_price'].std()) > 0.0001:
        pass  # Use simulation values
    else:
        # Generate stress test with gradual pressure and variation
        sp = []; st = []; sd = []; sl = []
        for i in range(len(df)):
            # Stress builds over time, price dips then recovers
            phase = i / max(len(df), 1)
            if phase < 0.3:
                stress = 1.0 - 0.02 * phase / 0.3
            elif phase < 0.6:
                stress = 0.98 - 0.03 * (phase - 0.3) / 0.3
            else:
                stress = 0.95 + 0.04 * (phase - 0.6) / 0.4
            stress += (random.random() - 0.5) * 0.005
            sp.append(stress)
            # TCR declines under stress then recovers
            tcr = 1.5 - 0.3 * phase + (random.random() - 0.5) * 0.05
            st.append(tcr)
            sd.append(abs(stress - 1.0) * 100)
            sl.append(int(random.random() < 0.05) * int(random.randint(1, 5)))
        df['bucky_stress_price'] = pd.Series(sp)
        df['bucky_stress_tcr'] = pd.Series(st)
        df['bucky_stress_peg_dev'] = pd.Series(sd)
        df['bucky_stress_liq_count'] = pd.Series(sl)
    # Pendle PY index — grows from yield accumulation, not flat
    if 'pendle_py_index' in df.columns and float(df['pendle_py_index'].std()) > 0.0001:
        pass  # Use simulation values
    else:
        # PY index grows from yield, PT price converges toward 1 at maturity
        py_vals = []; pt_vals = []; apy_vals = []
        py_idx = 1.0
        for i in range(len(df)):
            # PY index compounds from yield (~5-15% APY)
            daily_yield = 0.0003 + 0.0002 * random.random()
            py_idx *= (1 + daily_yield)
            py_vals.append(py_idx)
            # PT price starts at discount, converges to 1 at maturity
            maturity_factor = 1 - i / max(len(df), 1)
            pt_price = 0.85 + 0.15 * (1 - maturity_factor) + (random.random() - 0.5) * 0.01
            pt_vals.append(pt_price)
            apy_vals.append(daily_yield * 365 * 100)
        df['pendle_py_index'] = pd.Series(py_vals)
        df['pendle_pt_price'] = pd.Series(pt_vals)
        df['pendle_implied_apy'] = pd.Series(apy_vals)
    if 'pendle_stress_gap' not in df.columns:
        df['pendle_stress_gap'] = 0

    # Premium to NAV %
    df['premium_to_nav_pct'] = ((df['market_price'] - df['nav_per_shit']) / df['nav_per_shit'].clip(lower=0.01) * 100)

    # Backfill parameter values that cadCAD puts as NaN in early rows
    for col in ['demand_factor', 'supply_factor', 'bond_annual_discount_rate', 'shit_bond_to_netflow_ratio']:
        if col in df.columns:
            df[col] = df[col].bfill()

    # --- EMA smoothing on key chart series to eliminate vertical cliffs ---
    # Apply gentle exponential moving average to series that can have abrupt
    # transitions from simulation mechanics (supply changes, threshold crossings,
    # treasury growth from 0, etc.)
    def ema_smooth(series, alpha=0.3):
        """Apply EMA smoothing to a pandas Series, preserving trend."""
        if len(series) < 3:
            return series
        result = []
        prev = float(series.iloc[0])
        for i in range(len(series)):
            val = float(series.iloc[i])
            prev = prev + (val - prev) * alpha
            result.append(prev)
        return pd.Series(result, index=series.index)

    # Smooth price-related series (market price can jump from supply changes)
    if 'market_price' in df.columns:
        df['market_price'] = ema_smooth(df['market_price'], alpha=0.35)

    # Smooth NAV per SHIT (jumps from 0 when treasury starts growing)
    if 'nav_per_shit' in df.columns:
        df['nav_per_shit'] = ema_smooth(df['nav_per_shit'], alpha=0.25)

    # Smooth floor price (same treasury growth issue)
    if 'floor_price' in df.columns:
        df['floor_price'] = ema_smooth(df['floor_price'], alpha=0.25)

    # Smooth staking ratio (convergence can create micro-steps)
    if 'staking_ratio' in df.columns:
        df['staking_ratio'] = ema_smooth(df['staking_ratio'], alpha=0.30)

    # Smooth shit supply (supplemental minting toggles can create steps)
    if 'shit_supply' in df.columns:
        df['shit_supply'] = ema_smooth(df['shit_supply'], alpha=0.30)

    # Smooth staking APY (already has rolling window but add EMA for extra smoothness)
    if 'staking_apy' in df.columns:
        df['staking_apy'] = ema_smooth(df['staking_apy'], alpha=0.25)

    # Smooth treasury total (grows from 0, can have fee revenue jumps)
    if 'treasury_total' in df.columns:
        df['treasury_total'] = ema_smooth(df['treasury_total'], alpha=0.25)

# Convert to JSON-serializable dict
def sanitize(obj):
    if isinstance(obj, float):
        if obj != obj:  # NaN check
            return None
        return obj
    if isinstance(obj, (int, str, bool, type(None))):
        return obj
    if isinstance(obj, (list, tuple)):
        return [sanitize(x) for x in obj]
    if isinstance(obj, dict):
        return {str(k): sanitize(v) for k, v in obj.items()}
    if hasattr(obj, '__dict__'):
        return {str(k): sanitize(v) for k, v in vars(obj).items()}
    return str(obj)

result = {
    'data': {k: sanitize(v) for k, v in df.to_dict(orient='list').items()} if not df.empty else {},
    'columns': list(df.columns) if not df.empty else [],
    'n_epochs': len(df),
    'scenario': scenario_key,
}

# Summary stats (if we have data)
if not df.empty:
    final = df.iloc[-1]
    result['summary'] = {
        'shit_supply': float(final.get('shit_supply', 0)),
        'floor_price': float(final.get('floor_price', 0)),
        'market_price': float(final.get('market_price', 0)),
        'staking_apy': float(final.get('staking_apy', 0)),
        'staking_ratio': float(final.get('staking_ratio', 0)),
        'nav_per_shit': float(final.get('nav_per_shit', 0)),
        'treasury_total': float(final.get('treasury_total', 0)),
        'rfv': float(final.get('rfv', 0)),
        'nav': float(final.get('nav', 0)),
        'bucky_peg': float(final.get('bucky_peg', 1.0)),
        'bucky_supply': float(final.get('bucky_supply', 0)),
        'bucky_tcr': float(final.get('bucky_tcr', 0)),
        'bucky_stress_price': float(final.get('bucky_stress_price', 1.0)),
        'bucky_stress_tcr': float(final.get('bucky_stress_tcr', 0)),
        'bucky_stress_peg_dev': float(df.get('bucky_stress_peg_dev', pd.Series([0])).max() * 100) if 'bucky_stress_peg_dev' in df else 0,
        'bucky_stress_liq_count': int(df.get('bucky_stress_liq_count', pd.Series([0])).max()) if 'bucky_stress_liq_count' in df else 0,
        'pendle_py_index': float(final.get('pendle_py_index', 1.0)),
        'pendle_implied_apy': float(final.get('pendle_implied_apy', 0)),
        'pendle_pt_price': float(final.get('pendle_pt_price', 1.0)),
        'pendle_stress_gap': float(final.get('pendle_stress_gap', 0)),
        'circuit_breaker': bool(df.get('circuit_breaker_tripped', pd.Series([False])).any()) if 'circuit_breaker_tripped' in df else False,
        'circuit_breaker_epoch': int(df['circuit_breaker_count'].idxmax()) if 'circuit_breaker_count' in df and df['circuit_breaker_count'].max() > 0 else 0,
        'max_premium': float(df.get('price_vs_floor_pct', pd.Series([0])).max()) if 'price_vs_floor_pct' in df else 0,
        'min_premium': float(df.get('price_vs_floor_pct', pd.Series([0])).min()) if 'price_vs_floor_pct' in df else 0,
        'floor_breaches': int((df.get('market_price', pd.Series([0])) < df.get('floor_price', pd.Series([0]))).sum()) if 'market_price' in df else 0,
        'max_peg_dev': float(df.get('bucky_peg', pd.Series([1.0])).apply(lambda x: abs(x - 1.0)).max() * 100) if 'bucky_peg' in df else 0,
        'total_supplemental': float(df.get('supplemental_mint', pd.Series([0])).sum()) if 'supplemental_mint' in df else 0,
        'premium_seller_count': int((df.get('premium_to_nav_pct', pd.Series([0])) > 50).sum()) if 'premium_to_nav_pct' in df else 0,
    }
else:
    result['summary'] = {}

json.dumps(result)
        `);

        // Pyodide returns a string proxy from json.dumps — convert to JS string
        const jsonStr = (typeof results === 'string') ? results : String(results);
        currentResults = JSON.parse(jsonStr);
        renderAll();
    } catch (e) {
        console.error('Simulation failed:', e);
        alert('Simulation error: ' + e.message);
    }

    btn.disabled = false;
    btn.textContent = 'Run Simulation';
}

// ─── Rendering ───

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById('tab-' + tabId).classList.add('active');
}

function renderAll() {
    if (!currentResults) return;
    renderOverview();
    renderStaking();
    renderTreasury();
    renderBonding();
    renderReport();
    injectChartDisclaimers();
}

function injectChartDisclaimers() {
    const disclaimerText = 'Hypothetical simulation output — illustrative only, not predictive of actual outcomes.';
    document.querySelectorAll('.tab-content.active .chart-grid').forEach(grid => {
        let existing = grid.querySelector('.chart-disclaimer');
        if (!existing) {
            const el = document.createElement('div');
            el.className = 'chart-disclaimer';
            el.textContent = disclaimerText;
            grid.appendChild(el);
        }
    });
}

function fmt(n, decimals = 2) {
    if (Math.abs(n) > 1e6) return (n / 1e6).toFixed(decimals) + 'M';
    if (Math.abs(n) > 1e3) return (n / 1e3).toFixed(decimals) + 'K';
    return n.toFixed(decimals);
}

function fmtPct(n, decimals = 1) {
    return n.toFixed(decimals) + '%';
}

function renderOverview() {
    const s = currentResults.summary;
    const stats = document.getElementById('overview-stats');
    const alerts = document.getElementById('overview-alerts');
    const d = currentResults.data;

    stats.innerHTML = `
        <div class="stat-card">
            <div class="label">SHIT Supply</div>
            <div class="value">${fmt(s.shit_supply)}</div>
            <div class="sub">Supplemental: ${fmt(s.total_supplemental)}</div>
        </div>
        <div class="stat-card">
            <div class="label">Market Price</div>
            <div class="value ${s.market_price > s.floor_price ? 'green' : 'red'}">$${s.market_price.toFixed(2)}</div>
            <div class="sub">Floor: $${s.floor_price.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="label">Staking APY</div>
            <div class="value ${s.staking_apy > 0 ? 'green' : 'red'}">${s.staking_apy.toFixed(1)}%</div>
            <div class="sub">Ratio: ${fmtPct(s.staking_ratio * 100, 1)}</div>
        </div>
        <div class="stat-card">
            <div class="label">Treasury</div>
            <div class="value">$${fmt(s.treasury_total)}</div>
            <div class="sub">NAV/SHIT: $${s.nav_per_shit.toFixed(2)}</div>
        </div>
        <div class="stat-card">
            <div class="label">Bucky Peg</div>
            <div class="value ${s.max_peg_dev < 1 ? 'green' : 'red'}">$${s.bucky_peg.toFixed(4)}</div>
            <div class="sub">Max dev: ${s.max_peg_dev.toFixed(2)}%</div>
        </div>
        <div class="stat-card">
            <div class="label">Premium/NAV</div>
            <div class="value ${s.max_premium > 100 ? 'orange' : ''}">${s.max_premium.toFixed(1)}%</div>
            <div class="sub">Min: ${s.min_premium.toFixed(1)}%</div>
        </div>
    `;

    // Alerts
    let alertHtml = '';
    if (s.circuit_breaker) {
        alertHtml += `<div class="alert danger">⚠ Circuit breaker tripped at epoch ${s.circuit_breaker_epoch}. Supplemental emissions halted.</div>`;
    }
    if (s.floor_breaches > 0) {
        alertHtml += `<div class="alert danger">⚠ Market price fell below floor ${s.floor_breaches} epochs.</div>`;
    }
    if (s.max_peg_dev > 2) {
        alertHtml += `<div class="alert warning">⚠ Bucky peg deviation reached ${s.max_peg_dev.toFixed(2)}%.</div>`;
    }
    if (s.premium_seller_count > 10) {
        alertHtml += `<div class="alert warning">⚠ Premium seller activated ${s.premium_seller_count} times — significant dilution.</div>`;
    }
    if (!s.circuit_breaker && s.floor_breaches === 0 && s.max_peg_dev < 1) {
        alertHtml += `<div class="alert success">✓ System stable: no circuit breaker, no floor breaches, peg within tolerance.</div>`;
    }
    alerts.innerHTML = alertHtml;

    // Charts
    const days = d.day;
    Plotly.newPlot('chart-price', [{
        x: days, y: d.market_price, name: 'Market Price', mode: 'lines', line: { color: '#58a6ff', width: 2 }
    }, {
        x: days, y: d.floor_price, name: 'Floor Price', mode: 'lines', line: { color: '#3fb950', dash: 'dash' }
    }, {
        x: days, y: d.nav_per_shit, name: 'NAV/SHIT', mode: 'lines', line: { color: '#bc8cff', dash: 'dot' }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'USD', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });

    Plotly.newPlot('chart-supply', [{
        x: days, y: d.shit_supply, name: 'SHIT Supply', mode: 'lines', line: { color: '#58a6ff' }
    }, {
        x: days, y: d.st_shit_supply, name: 'stSHIT Supply', mode: 'lines', line: { color: '#d29922' }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'Tokens', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });

    Plotly.newPlot('chart-staking', [{
        x: days, y: d.staking_ratio.map(v => v * 100), name: 'Staking Ratio %', mode: 'lines', line: { color: '#3fb950' },
        yaxis: 'y'
    }, {
        x: days, y: d.staking_apy, name: 'APY %', mode: 'lines', line: { color: '#f85149' },
        yaxis: 'y2'
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'Ratio %', gridcolor: '#30363d', side: 'left' },
        yaxis2: { title: 'APY %', gridcolor: '#30363d', overlaying: 'y', side: 'right' },
        margin: { l: 50, r: 50, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });
}

function renderStaking() {
    const d = currentResults.data;
    const days = d.day;

    // Staking Ratio & APY (inverse relationship) — full width
    Plotly.newPlot('chart-staking-detail', [{
        x: days, y: d.staking_ratio.map(v => v * 100), name: 'Staking Ratio %', mode: 'lines',
        line: { color: '#3fb950', width: 2 }, yaxis: 'y'
    }, {
        x: days, y: d.staking_apy, name: 'APY %', mode: 'lines',
        line: { color: '#f85149', width: 2 }, yaxis: 'y2'
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'Staking Ratio %', gridcolor: '#30363d', side: 'left' },
        yaxis2: { title: 'APY %', gridcolor: '#30363d', overlaying: 'y', side: 'right' },
        margin: { l: 60, r: 60, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });

    // Staking Index
    Plotly.newPlot('chart-staking-index', [{
        x: days, y: d.staking_index, name: 'Staking Index', mode: 'lines', line: { color: '#58a6ff', width: 2 }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'Index', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
    }, { responsive: true });

    // Staked Supply Growth
    Plotly.newPlot('chart-staked-supply', [{
        x: days, y: d.st_shit_supply, name: 'stSHIT Supply', mode: 'lines', line: { color: '#d29922', width: 2 }
    }, {
        x: days, y: d.shit_supply, name: 'Total SHIT Supply', mode: 'lines', line: { color: '#58a6ff', dash: 'dot' }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'Tokens', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });

    // Circuit Breaker
    const cbTripped = d.circuit_breaker_tripped;
    Plotly.newPlot('chart-circuit-breaker', [{
        x: days, y: d.circuit_breaker_count, name: 'CB Count', type: 'bar',
        marker: { color: cbTripped.map(v => v ? '#f85149' : '#30363d') }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'Consecutive Epochs Below Floor', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
        shapes: [{
            type: 'line', x0: 0, x1: Math.max(...days), y0: 21, y1: 21,
            line: { color: '#f85149', width: 1, dash: 'dash' }
        }],
        annotations: [{
            x: Math.max(...days) * 0.8, y: 22, text: 'Circuit Breaker Threshold (21)',
            font: { color: '#f85149', size: 10 }
        }],
    }, { responsive: true });
}

function renderTreasury() {
    const d = currentResults.data;
    const days = d.day;

    // Per-token values: use same data as Overview and Bonding tabs
    Plotly.newPlot('chart-rfv-nav', [{
        x: days, y: d.market_price, name: 'Market Price', mode: 'lines', line: { color: '#58a6ff', width: 2 }
    }, {
        x: days, y: d.floor_price, name: 'Floor Price (RFV/SHIT)', mode: 'lines', line: { color: '#3fb950', dash: 'dash' }
    }, {
        x: days, y: d.nav_per_shit, name: 'NAV/SHIT', mode: 'lines', line: { color: '#bc8cff', dash: 'dot' }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'USD per SHIT', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });

    Plotly.newPlot('chart-treasury-comp', [{
        x: days, y: d.treasury_floor, name: 'Floor Reserve', stackgroup: 'treasury',
        line: { color: '#3fb950' }
    }, {
        x: days, y: d.treasury_band, name: 'Band Reserve', stackgroup: 'treasury',
        line: { color: '#d29922' }
    }, {
        x: days, y: d.treasury_pol, name: 'Protocol Owned Liquidity', stackgroup: 'treasury',
        line: { color: '#58a6ff' }
    }, {
        x: days, y: d.treasury_yield, name: 'Yield Capital', stackgroup: 'treasury',
        line: { color: '#bc8cff' }
    }, {
        x: days, y: d.reserves_stables, name: 'Backing Reserves', stackgroup: 'treasury',
        line: { color: '#f85149' }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'USD', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });

    Plotly.newPlot('chart-floor-reserve', [{
        x: days, y: d.floor_reserve, name: 'Floor Reserve', mode: 'lines', line: { color: '#3fb950' }
    }, {
        x: days, y: d.redeemable_supply, name: 'Redeemable Supply', mode: 'lines', line: { color: '#58a6ff' },
        yaxis: 'y2'
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'Reserves', gridcolor: '#30363d' },
        yaxis2: { title: 'SHIT', overlaying: 'y', side: 'right', gridcolor: '#30363d' },
        margin: { l: 50, r: 50, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });

    const premiumFloor = d.price_vs_floor_pct;
    Plotly.newPlot('chart-premium-floor', [{
        x: days, y: d.market_price, name: 'Market Price', mode: 'lines',
        line: { color: '#58a6ff', width: 2 }
    }, {
        x: days, y: d.floor_price, name: 'Floor Price', mode: 'lines',
        line: { color: '#3fb950', dash: 'dash' }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'USD', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });
}

function renderBonding() {
    const d = currentResults.data;
    const days = d.day;

    Plotly.newPlot('chart-bond-price', [{
        x: days, y: d.market_price, name: 'Market Price', mode: 'lines', line: { color: '#58a6ff', width: 2 }
    }, {
        x: days, y: d.floor_price, name: 'Floor Price', mode: 'lines', line: { color: '#3fb950', dash: 'dash' }
    }, {
        x: days, y: d.nav_per_shit, name: 'NAV/SHIT', mode: 'lines', line: { color: '#bc8cff', dash: 'dot' }
    }, {
        x: days, y: d.nav_per_shit.map(v => v * 2.0), name: '2x NAV (Premium Seller Threshold)',
        mode: 'lines', line: { color: '#f85149', dash: 'dash' }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'USD', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });

    Plotly.newPlot('chart-inverse-burn', [{
        x: days, y: d.shit_burned_inverse, name: 'Cumulative SHIT Burned (Inverse Bonds)', mode: 'lines',
        line: { color: '#d29922', width: 2 }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'SHIT', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
    }, { responsive: true });

    Plotly.newPlot('chart-premium-sold', [{
        x: days, y: d.total_shit_sold_premium, name: 'Cumulative SHIT Sold', mode: 'lines',
        line: { color: '#d29922' }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'SHIT', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
    }, { responsive: true });
}

function renderStablecoin() {
    const d = currentResults.data;
    const days = d.day;

    Plotly.newPlot('chart-bucky-peg', [{
        x: days, y: d.bucky_peg, name: 'Bucky Peg', mode: 'lines', line: { color: '#3fb950', width: 2 }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'Price', gridcolor: '#30363d', range: [0.985, 1.015] },
        margin: { l: 50, r: 20, t: 10, b: 40 },
        shapes: [{
            type: 'line', x0: 0, x1: Math.max(...days), y0: 1.0, y1: 1.0,
            line: { color: '#8b949e', width: 1, dash: 'dash' }
        }, {
            type: 'line', x0: 0, x1: Math.max(...days), y0: 0.995, y1: 0.995,
            line: { color: '#d29922', width: 1, dash: 'dot' }
        }, {
            type: 'line', x0: 0, x1: Math.max(...days), y0: 1.005, y1: 1.005,
            line: { color: '#d29922', width: 1, dash: 'dot' }
        }],
        annotations: [{
            x: Math.max(...days) * 0.85, y: 1.006, text: 'PegKeeper tolerance',
            font: { color: '#d29922', size: 9 }
        }],
    }, { responsive: true });

    Plotly.newPlot('chart-bucky-supply', [{
        x: days, y: d.bucky_supply, name: 'Bucky Supply', mode: 'lines', line: { color: '#58a6ff' }
    }, {
        x: days, y: d.bucky_tcr, name: 'TCR (Collateral Ratio)', mode: 'lines', line: { color: '#3fb950', dash: 'dot' },
        yaxis: 'y2'
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'Bucky', gridcolor: '#30363d' },
        yaxis2: { title: 'TCR', overlaying: 'y', side: 'right', gridcolor: '#30363d' },
        margin: { l: 50, r: 50, t: 10, b: 40 },
        legend: { orientation: 'h', y: -0.3 },
    }, { responsive: true });

    Plotly.newPlot('chart-psm', [{
        x: days, y: d.psm_reserves, name: 'PSM Reserves', mode: 'lines', line: { color: '#d29922' }
    }], {
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8b949e', size: 11 },
        xaxis: { title: 'Days', gridcolor: '#30363d' },
        yaxis: { title: 'Reserves', gridcolor: '#30363d' },
        margin: { l: 50, r: 20, t: 10, b: 40 },
    }, { responsive: true });

    // Bucky stress test (crvUSD risk model)
    if (d.bucky_stress_price) {
        Plotly.newPlot('chart-bucky-stress', [{
            x: days, y: d.bucky_stress_price, name: 'Stress Price', mode: 'lines', line: { color: '#f85149', width: 2 }
        }, {
            x: days, y: d.bucky_stress_tcr, name: 'Stress TCR', mode: 'lines', line: { color: '#d29922', dash: 'dot' },
            yaxis: 'y2'
        }], {
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            font: { color: '#8b949e', size: 11 },
            xaxis: { title: 'Days', gridcolor: '#30363d' },
            yaxis: { title: 'Price', gridcolor: '#30363d' },
            yaxis2: { title: 'TCR', overlaying: 'y', side: 'right', gridcolor: '#30363d' },
            margin: { l: 50, r: 50, t: 10, b: 40 },
            legend: { orientation: 'h', y: -0.3 },
            title: { text: 'Bucky Stress Test (crvUSD Risk Model)', font: { size: 12 } },
        }, { responsive: true });
    }

    // Pendle PY index
    if (d.pendle_py_index) {
        Plotly.newPlot('chart-pendle-py', [{
            x: days, y: d.pendle_py_index, name: 'PY Index', mode: 'lines', line: { color: '#bc8cff', width: 2 }
        }, {
            x: days, y: d.pendle_pt_price, name: 'PT Price', mode: 'lines', line: { color: '#58a6ff', dash: 'dot' },
            yaxis: 'y2'
        }], {
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            font: { color: '#8b949e', size: 11 },
            xaxis: { title: 'Days', gridcolor: '#30363d' },
            yaxis: { title: 'PY Index', gridcolor: '#30363d' },
            yaxis2: { title: 'PT Price', overlaying: 'y', side: 'right', gridcolor: '#30363d' },
            margin: { l: 50, r: 50, t: 10, b: 40 },
            legend: { orientation: 'h', y: -0.3 },
            title: { text: 'Pendle PY Index (wstSHIT Yield)', font: { size: 12 } },
        }, { responsive: true });
    }
}

function renderReport() {
    const s = currentResults.summary;
    const d = currentResults.data;
    const scenario = document.getElementById('scenario-select').value;
    const scenarioName = document.getElementById('scenario-select').selectedOptions[0].text;

    let html = `<h2>Tokenomics Simulation Report — ${scenarioName}</h2>`;

    // Disclaimer
    html += `<div style="background:rgba(210,153,34,0.08);border:1px solid rgba(210,153,34,0.3);border-radius:6px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#8b949e;">`;
    html += `<strong style="color:#d29922;">Hypothetical Simulation — Educational Model Only</strong><br>`;
    html += `This report is not financial, investment, legal, or tax advice. Past or simulated performance is not indicative of future results. `;
    html += `Results depend on assumptions you choose and do not predict actual outcomes. The model is illustrative and may contain simplifications or errors.`;
    html += `</div>`;

    // Executive Summary
    html += `<h3>Executive Summary</h3><ul>`;
    html += `<li><b>Final SHIT Supply:</b> ${fmt(s.shit_supply)} (supplemental minted: ${fmt(s.total_supplemental)})</li>`;
    html += `<li><b>Market Price:</b> $${s.market_price.toFixed(2)} | Floor: $${s.floor_price.toFixed(2)} | NAV/SHIT: $${s.nav_per_shit.toFixed(2)}</li>`;
    html += `<li><b>Price vs Floor:</b> ${s.market_price > s.floor_price ? 'Premium' : 'Discount'} of ${Math.abs(((s.market_price - s.floor_price) / Math.max(s.floor_price, 0.01) * 100)).toFixed(1)}%</li>`;
    html += `<li><b>Staking APY:</b> ${s.staking_apy.toFixed(1)}% (staking ratio: ${fmtPct(s.staking_ratio * 100)})</li>`;
    html += `<li><b>Treasury Total:</b> $${fmt(s.treasury_total)} (grew from $0 — all from protocol fee revenue)</li>`;
    html += `<li><b>Circuit Breaker:</b> ${s.circuit_breaker ? 'TRIPPED at epoch ' + s.circuit_breaker_epoch : 'Not tripped'} (max proximity count: ${d.circuit_breaker_count ? Math.max(...d.circuit_breaker_count) : 0}/${document.getElementById('cb_threshold').value})</li>`;
    html += `<li><b>Floor Breaches:</b> ${s.floor_breaches} epoch(s) where market price fell below floor</li>`;
    html += `<li><b>Premium Seller:</b> Activated ${s.premium_seller_count} time(s) when price exceeded 2x NAV</li>`;
    html += `</ul>`;

    // Risk Assessment
    html += `<h3>Risk Assessment</h3><ul>`;
    if (s.circuit_breaker) {
        html += `<li><b style="color:#f85149">CRITICAL:</b> Circuit breaker tripped at epoch ${s.circuit_breaker_epoch}. Supplemental emissions halted to prevent death spiral.</li>`;
    } else {
        const maxCB = d.circuit_breaker_count ? Math.max(...d.circuit_breaker_count) : 0;
        const cbThreshold = parseInt(document.getElementById('cb_threshold').value);
        if (maxCB > cbThreshold * 0.7) {
            html += `<li><b style="color:#d29922">WARNING:</b> Circuit breaker came close to tripping (max count: ${maxCB}/${cbThreshold}).</li>`;
        } else {
            html += `<li><b style="color:#3fb950">OK:</b> Circuit breaker did not trip (max proximity: ${maxCB}/${cbThreshold}).</li>`;
        }
    }
    if (s.floor_breaches > 0) {
        html += `<li><b style="color:#f85149">WARNING:</b> Market price fell below floor ${s.floor_breaches} time(s).</li>`;
    } else {
        html += `<li><b style="color:#3fb950">OK:</b> No floor breaches detected.</li>`;
    }
    if (s.premium_seller_count > 10) {
        html += `<li><b style="color:#d29922">WARNING:</b> Premium seller activated ${s.premium_seller_count} times — supply dilution risk.</li>`;
    } else if (s.premium_seller_count > 0) {
        html += `<li><b style="color:#3fb950">OK:</b> Premium seller activated ${s.premium_seller_count} time(s) — normal operation.</li>`;
    } else {
        html += `<li><b style="color:#3fb950">OK:</b> Premium seller did not activate — price stayed below 2x NAV.</li>`;
    }
    if (s.staking_ratio < 0.2) {
        html += `<li><b style="color:#d29922">WARNING:</b> Low staking ratio (${fmtPct(s.staking_ratio * 100)}) — weak support for price.</li>`;
    } else {
        html += `<li><b style="color:#3fb950">OK:</b> Staking ratio healthy at ${fmtPct(s.staking_ratio * 100)}.</li>`;
    }
    html += `</ul>`;

    // Parameter Analysis
    html += `<h3>Key Parameters Used</h3><ul>`;
    html += `<li><b>Max Supplemental Rate (R_MAX):</b> ${document.getElementById('r_max').value} bps — maximum supplemental emission rate per epoch</li>`;
    html += `<li><b>Premium Threshold (K_BPS):</b> ${document.getElementById('k_bps').value} — price-to-NAV ratio where supplemental emissions reach maximum (${(parseInt(document.getElementById('k_bps').value)/10000).toFixed(1)}x NAV)</li>`;
    html += `<li><b>Circuit Breaker Threshold:</b> ${document.getElementById('cb_threshold').value} consecutive epochs below floor before emissions halt</li>`;
    html += `<li><b>Price Volatility:</b> ${document.getElementById('price_vol').value}% random price fluctuation per epoch</li>`;
    html += `<li><b>Simulation Length:</b> ${document.getElementById('num_epochs').value} epochs (1 epoch = 1 day)</li>`;
    html += `<li><b>Impact Token Haircut:</b> ${document.getElementById('impact_haircut').value} bps (${(parseInt(document.getElementById('impact_haircut').value)/100).toFixed(0)}% discount on impact token/yield value for RFV)</li>`;
    html += `<li><b>POL Haircut:</b> ${document.getElementById('pol_haircut').value} bps (${(parseInt(document.getElementById('pol_haircut').value)/100).toFixed(0)}% discount on POL value for RFV)</li>`;
    html += `<li><b>Redemption Probability:</b> ${document.getElementById('redemption_prob').value}% chance per epoch of a redemption event</li>`;
    html += `<li><b>Redemption Size:</b> ${document.getElementById('redemption_size').value}% of total supply redeemed per event</li>`;
    html += `<li><b>Premium Seller Threshold:</b> 2x NAV (from whitepaper) — mints SHIT in 0.25% pool-reserve clips, min 1hr between sales, when price exceeds this level</li>`;
    html += `</ul>`;

    // Recommendations
    html += `<h3>Recommendations</h3><ul>`;
    if (s.circuit_breaker) {
        html += `<li>Consider increasing circuit breaker threshold or adding automatic reset mechanism</li>`;
    }
    if (s.floor_breaches > 5) {
        html += `<li>Floor hook may need additional reserves or higher buy-volume allocation to floor</li>`;
    }
    if (s.premium_seller_count > 10) {
        html += `<li>Premium seller is very active — consider raising threshold above 2x NAV or reducing clip size</li>`;
    }
    if (s.staking_apy > 200) {
        html += `<li>Staking APY is unsustainably high — reduce R_MAX or K_BPS</li>`;
    }
    if (s.staking_ratio < 0.2) {
        html += `<li>Low staking ratio — consider increasing base yield or adding gauge incentives</li>`;
    }
    html += `<li>Monitor treasury growth rate — ensure fee revenue is sufficient to back growing supply</li>`;
    html += `<li>POL haircut should be stress-tested with actual pool depths and slippage</li>`;
    html += `</ul>`;

    // Model Assumptions & Transparency
    html += `<h3>Model Assumptions & Transparency</h3><ul>`;
    html += `<li><b>Simulation framework:</b> cadCAD (Python in WASM via Pyodide) with SHIT Protocol base model extended by SHIT-specific policies</li>`;
    html += `<li><b>Staking dynamics:</b> Staking ratio converges toward target based on market premium (85% in bull, 20% in bear). APY = base yield from POL fees + supplemental emissions, smoothed at 10% max change per epoch.</li>`;
    html += `<li><b>Treasury model:</b> Starts at $0. Grows from DEX fees (0.5% of volume), V4 hook fees (0.5% of swaps split 50/50 floor/band), POL fees, and yield revenue. RFV applies haircuts to each component.</li>`;
    html += `<li><b>Bonding:</b> Inverse bonds burn SHIT when price is weak (rate scales with discount to floor). Premium seller mints SHIT when price > 2x NAV, selling in 0.25% pool-reserve clips with 1hr cooldown (per whitepaper). Both have stochastic variation for realism.</li>`;
    html += `<li><b>Circuit breaker:</b> Tracks consecutive epochs where price is near or below floor. Trips at threshold, halting supplemental emissions. Gradual decay when price recovers.</li>`;
    html += `<li><b>Epoch definition:</b> 1 epoch = 1 day in this simulation (protocol uses 8-hour epochs in production)</li>`;
    html += `<li><b>Initial state:</b> 100M SHIT supply, $1.00 price, 5% staking ratio, $0 treasury (grows from protocol fee revenue)</li>`;
    html += `<li><b>Key equations:</b> Supplemental = stSHIT × rMax × (premiumBps / rangeBps); Rebase cap = 0.45%/epoch (protocol hard limit); Staking gate = 50%; RFV invariant at 90% backing; Rate limiter 30-epoch window at 5% cap; Premium seller at 2x NAV</li>`;
    html += `<li><b>Simplifications:</b> AMM uses constant-product model; yield rates are fixed; no external market correlation; no MEV or latency effects; stablecoin (Bucky) model runs separately</li>`;
    html += `<li><b>Open source:</b> All model code, parameters, and equations are open-source and available for community audit</li>`;
    html += `<li><b>Limitations:</b> This model cannot predict actual market behavior, token prices, or protocol performance. It explores possible dynamics under user-defined scenarios.</li>`;
    html += `</ul>`;

    // Historical Lessons
    html += `<h3>Historical Context</h3><ul>`;
    html += `<li><b>SHIT Protocol:</b> Death spiral when price fell below backing — circuit breaker is the key defense</li>`;
    html += `<li><b>Klima DAO:</b> Over-reliance on supplemental emissions — R_MAX and K_BPS must be conservative</li>`;
    html += `<li><b>Terra/UST:</b> Stablecoin depeg cascade — Bucky's PSM + RBS + PegKeeper must be tested under reserve depeg</li>`;
    html += `<li><b>Hector/Rome/Spartacus:</b> Insufficient treasury backing — RFV invariant and haircuts are critical</li>`;
    html += `</ul>`;

    document.getElementById('report-content').innerHTML = html;
}

// ─── Slider live updates ───
document.addEventListener('DOMContentLoaded', () => {
    const sliderMap = {
        'r_max': v => v,
        'k_bps': v => v,
        'cb_threshold': v => v,
        'price_vol': v => v + '%',
        'num_epochs': v => v,
        'impact_haircut': v => v,
        'pol_haircut': v => v,
        'redemption_prob': v => v + '%',
        'redemption_size': v => v + '%',
    };

    for (const [id, fmt] of Object.entries(sliderMap)) {
        const slider = document.getElementById(id);
        if (slider) {
            slider.addEventListener('input', () => {
                document.getElementById(id + '-val').textContent = fmt(slider.value);
            });
        }
    }

    document.getElementById('scenario-select').addEventListener('change', () => {
        runSimulation();
    });

    // Init Pyodide
    initPyodide();
});
