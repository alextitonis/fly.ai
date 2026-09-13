-- SHIT Token D1 Schema v2 — self-improvement tables
-- Adds training data and model version tracking for the reservoir readout

-- Training data: links fly brain signals to trade outcomes
CREATE TABLE IF NOT EXISTS training_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_id INTEGER NOT NULL,
  token_address TEXT NOT NULL,
  features TEXT NOT NULL,        -- JSON: {liquidity, volume, momentum, buy_ratio, score, age}
  neural_activity TEXT NOT NULL, -- JSON: {forward_L: 27.6, forward_R: 26.5, ...}
  entry_price REAL,
  exit_price REAL,
  pnl_percent REAL,
  outcome INTEGER,               -- 1=win, 0=loss, NULL=pending
  hold_time_seconds INTEGER,
  signal_created_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_training_outcome ON training_data(outcome);
CREATE INDEX IF NOT EXISTS idx_training_signal ON training_data(signal_id);

-- Model version tracking
CREATE TABLE IF NOT EXISTS model_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_type TEXT NOT NULL,      -- 'readout', 'encoder', 'scoring', 'trade_params'
  version INTEGER NOT NULL,
  cv_score REAL,                  -- cross-validation score (AUC for readout)
  trade_count INTEGER,           -- number of trades used for training
  metrics TEXT,                   -- JSON: {accuracy, precision, recall, ...}
  saved_at INTEGER NOT NULL
);

-- Settings for self-improvement
INSERT OR REPLACE INTO settings (key, value) VALUES ('retrain_every_n_trades', '10');
INSERT OR REPLACE INTO settings (key, value) VALUES ('min_training_samples', '10');
INSERT OR REPLACE INTO settings (key, value) VALUES ('readout_threshold', '0.55');
INSERT OR REPLACE INTO settings (key, value) VALUES ('profit_target_pct', '30');
INSERT OR REPLACE INTO settings (key, value) VALUES ('stop_loss_pct', '15');
INSERT OR REPLACE INTO settings (key, value) VALUES ('max_position_pct', '50');
