# Perps Funding-Rate Arbitrage Bot

Production-oriented starter bot for delta-neutral funding-rate arbitrage across perpetual DEX venues.

## Features

- Multi-venue funding-rate scanning (ccxt adapters)
- Per-venue sizing/precision guardrails (min amount, step size, min notional)
- Best-opportunity ranking by net APR (spread - fees - slippage)
- Hedged pair execution (short high FR, long low FR)
- Partial-fill reconciliation with automatic re-hedge
- Persistent open-position recovery on restart (rehydrates from executions/closes logs)
- Close workflow with realized PnL + funding/fees accounting
- Rebalance planning between venues
- Built-in risk controls (notional, aggregate exposure, open-position cap, delta bound)
- Dry-run mode and JSONL state persistence
- Config-driven runtime with CLI loop, one-shot, close, and rebalance modes

## Install

```bash
cd perps-funding-arb-bot
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

## Run tests

```bash
pytest -q
```

## Run bot

```bash
# one-shot
perps-arb --config config/bot.yaml --once

# continuous loop
perps-arb --config config/bot.yaml

# close open pair
perps-arb --config config/bot.yaml --close BTC/USDT:USDT

# generate rebalance plan
perps-arb --config config/bot.yaml --rebalance
```

## Data outputs (JSONL)

- data/opportunities.jsonl
- data/executions.jsonl
- data/closes.jsonl
- data/rebalances.jsonl

On startup, the engine reconstructs open positions by replaying `executions.jsonl` and removing symbols present in `closes.jsonl`.
This prevents duplicate openings after process restarts.

## Safety checklist

1. Keep `dry_run: true` until symbol mapping and balances are validated.
2. Keep strict `risk_limits` and low per-trade notional for initial live runs.
3. Monitor reconciliation and only scale once partial-fill behavior is stable.

## Project layout

- `src/perps_arb/scanner.py` - funding spread and net APR ranking
- `src/perps_arb/risk.py` - pre-trade risk checks
- `src/perps_arb/sizing.py` - precision/min-notional aware size calculation
- `src/perps_arb/reconcile.py` - fill mismatch detection and re-hedge decisions
- `src/perps_arb/accounting.py` - open/close ledger and realized PnL
- `src/perps_arb/close_rebalance.py` - rebalance transfer planning
- `src/perps_arb/engine.py` - orchestration + execution + close/rebalance flows
- `src/perps_arb/adapters/` - exchange adapter interface + ccxt implementation
- `src/perps_arb/store.py` - JSONL persistence
- `src/perps_arb/cli.py` - runtime entrypoint
- `tests/` - scanner, risk, execution, and hardening tests
