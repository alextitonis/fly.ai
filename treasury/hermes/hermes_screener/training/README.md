# Continuous Trading AI Training System

This module enables the token screener to continuously improve its trading
decisions by learning from every trade outcome.

## Architecture

```
Pipeline Stages (data producers)
     |
     v
ExperienceCollector  <-- hooks injected into existing scripts
     |                   (zero-impact, try/except wrapped)
     v
ExperienceBuffer     <-- SQLite ring buffer (~500k rows)
     |                   ~/.hermes/data/training/experiences.db
     v
RewardCalculator     <-- converts PnL + hold time -> scalar reward [-1, +1]
     |                   reward propagates back to all stages via episode_id
     v
DatasetBuilder       <-- builds JSONL instruction-tuning datasets
     |                   decision_dataset / scoring_dataset / monitor_dataset
     v
FineTuner            <-- LoRA fine-tune via Unsloth (fast) or HF PEFT (fallback)
     |                   4-bit quantized, trains on combined_dataset.jsonl
     v
ModelUpdater         <-- publishes adapter, hot-swaps into inference server
     |                   signals via HTTP POST or sentinel file
     v
Local AI Model       <-- serves improved predictions on next trading cycle
```

## Data Flow

Every pipeline stage emits experiences:

| Stage | Script | What is recorded |
|-------|--------|-----------------|
| Enrichment | token_enricher.py | token features + disqualifiers |
| Scoring | token_enricher + cross_scoring | score + breakdown |
| Decision | ai_trading_brain.py | buy/hold/sell + confidence |
| Monitor | trade_monitor.py | decay signal + AI action |
| Outcome | trade_monitor.py | PnL% + hold time (ground truth) |

When a trade closes, `record_trade_outcome()` computes a reward and
back-fills it to all earlier stages in the same `episode_id`.

## Reward Signal

```
PnL >= 200%   ->  reward =  1.00
PnL  50-100%  ->  reward =  0.70
PnL  10-25%   ->  reward =  0.30
PnL   0-5%    ->  reward =  0.05
PnL  -5-0%    ->  reward = -0.05
PnL -20--10%  ->  reward = -0.45
PnL < -30%    ->  reward = -1.00

+ hold time shaping:  ideal 2-24h, penalise churn or stale holds
* outcome multiplier: take_profit=1.0, stop_loss penalty, timeout penalty
```

## Usage

### Check buffer status
```bash
python -m hermes_screener.training.training_loop --status
```

### Build datasets only (no training)
```bash
python -m hermes_screener.training.training_loop --build-only
```

### Run one training cycle
```bash
python -m hermes_screener.training.training_loop --once
```

### Run continuous loop (every hour)
```bash
python -m hermes_screener.training.training_loop --interval 3600 --min-exp 50
```

### Use a smaller/faster model for testing
```bash
python -m hermes_screener.training.training_loop \
  --once --base-model google/gemma-2-2b-it --max-steps 50
```

## Hardware Requirements

| Config | VRAM | Speed |
|--------|------|-------|
| Minimum (7B 4-bit) | 8GB | ~30min/cycle |
| Recommended (7B 4-bit) | 16GB | ~10min/cycle |
| Fast (2B 4-bit, Unsloth) | 4GB | ~3min/cycle |
| CPU fallback | 32GB RAM | very slow |

## Configuration

Edit `FineTuner` defaults in `fine_tuner.py`:
```python
DEFAULT_TRAIN_CFG = {
    "base_model": "google/gemma-2-2b-it",  # change model here
    "lora_r": 16,
    "learning_rate": 2e-4,
    "num_train_epochs": 1,
    ...
}
```

## Files

```
~/.hermes/data/training/
  experiences.db           # SQLite buffer with all pipeline experiences
  datasets/
    decision_dataset.jsonl  # buy/hold/sell training samples
    scoring_dataset.jsonl   # token quality scoring samples
    monitor_dataset.jsonl   # position monitoring samples
    combined_dataset.jsonl  # merged + sorted by |reward|
    *_train.jsonl / *_eval.jsonl  # train/eval splits
  loop_state.json           # cycle counter + last result

~/.hermes/models/trading-lora/
  <cycle-tag>/              # adapter weights per cycle
    adapter_config.json
    adapter_model.safetensors
    tokenizer files
  adapter_latest.txt        # pointer to current adapter
  manifest.json             # version manifest
  reload_requested          # sentinel file for hot-swap
```

## Adding New Training Signals

To record a new pipeline stage, call the collector from any script:
```python
from hermes_screener.training import ExperienceCollector
collector = ExperienceCollector(source_script="my_script")

# Record any custom experience
from hermes_screener.training.experience_collector import Experience, PipelineStage
exp = Experience(
    stage="custom_stage",
    token_address="0x...",
    chain="ethereum",
    symbol="TOKEN",
    state={"my_feature": 42},
    action={"my_decision": "yes"},
)
collector._save(exp)
```
