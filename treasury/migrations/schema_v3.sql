-- SHIT Token D1 Schema v3 — multi-connectome trading collective + on-chain betting
-- Adds: 16 connectomes, 18 wallets, user bets, prediction rounds, P&L reports

-- Connectome registry — one row per biological connectome
CREATE TABLE IF NOT EXISTS connectomes (
  id TEXT PRIMARY KEY,            -- e.g. 'celegans', 'malecns', 'cat-cortex'
  species TEXT NOT NULL,           -- e.g. 'C. elegans', 'Drosophila'
  n_neurons INTEGER NOT NULL,
  n_synapses INTEGER,
  resolution TEXT NOT NULL,       -- 'single-neuron' or 'region-level'
  wallet_id INTEGER,               -- FK to wallets.id (individual wallet 1-16)
  r2_weights_key TEXT,            -- R2 key for weights.npz (e.g. 'celegans/weights.npz')
  r2_meta_key TEXT,               -- R2 key for brain.npz (e.g. 'celegans/brain.npz')
  status TEXT DEFAULT 'pending',  -- 'pending', 'active', 'paused', 'error'
  created_at INTEGER NOT NULL
);

-- Wallet registry — 18 wallets (16 individual + 1 global + 1 meta)
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connectome_id TEXT,              -- NULL for global/meta wallets
  wallet_type TEXT NOT NULL,      -- 'individual', 'global', 'meta'
  balance_usd REAL DEFAULT 1.0,   -- paper trading balance
  starting_balance REAL DEFAULT 1.0,
  total_pnl REAL DEFAULT 0.0,
  n_trades INTEGER DEFAULT 0,
  n_wins INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (connectome_id) REFERENCES connectomes(id)
);

-- On-chain P&L reports — governance worker reports connectome performance
CREATE TABLE IF NOT EXISTS connectome_pnl_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connectome_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,          -- epoch number
  pnl_percent REAL NOT NULL,       -- P&L for this epoch
  cumulative_pnl REAL NOT NULL,    -- cumulative P&L
  n_trades INTEGER NOT NULL,
  reported_at INTEGER NOT NULL,
  tx_hash TEXT,                    -- on-chain tx hash (agent-ledger)
  FOREIGN KEY (connectome_id) REFERENCES connectomes(id)
);

-- User bets — profit sharing vaults
CREATE TABLE IF NOT EXISTS user_vault_stakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  connectome_id TEXT NOT NULL,
  amount REAL NOT NULL,            -- SHIT tokens staked
  stake_tx_hash TEXT,
  unstake_tx_hash TEXT,
  pnl_share REAL,                  -- P&L share received
  status TEXT DEFAULT 'staked',    -- 'staked', 'unstaked', 'claimed'
  staked_at INTEGER NOT NULL,
  unstaked_at INTEGER,
  FOREIGN KEY (connectome_id) REFERENCES connectomes(id)
);

-- User bets — prediction markets (pari-mutuel)
CREATE TABLE IF NOT EXISTS user_prediction_bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  round_id INTEGER NOT NULL,       -- FK to prediction_rounds.id
  connectome_id TEXT NOT NULL,    -- which connectome user bets will win
  amount REAL NOT NULL,            -- SHIT tokens wagered
  bet_tx_hash TEXT,
  claimed BOOLEAN DEFAULT 0,
  payout REAL,                     -- SHIT tokens received if won
  claim_tx_hash TEXT,
  bet_at INTEGER NOT NULL,
  FOREIGN KEY (connectome_id) REFERENCES connectomes(id)
);

-- Prediction rounds — one per epoch (24h)
CREATE TABLE IF NOT EXISTS prediction_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  epoch INTEGER NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  total_pool REAL DEFAULT 0.0,     -- total SHIT wagered
  winner_connectome_id TEXT,       -- set at settlement
  settled BOOLEAN DEFAULT 0,
  settle_tx_hash TEXT,
  created_at INTEGER NOT NULL
);

-- User bets — copy trading
CREATE TABLE IF NOT EXISTS user_copy_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  connectome_id TEXT NOT NULL,    -- which connectome to copy
  amount REAL NOT NULL,            -- SHIT allocated to copy
  start_tx_hash TEXT,
  stop_tx_hash TEXT,
  realized_pnl REAL,
  status TEXT DEFAULT 'copying',   -- 'copying', 'stopped'
  started_at INTEGER NOT NULL,
  stopped_at INTEGER,
  FOREIGN KEY (connectome_id) REFERENCES connectomes(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connectomes_status ON connectomes(status);
CREATE INDEX IF NOT EXISTS idx_wallets_connectome ON wallets(connectome_id);
CREATE INDEX IF NOT EXISTS idx_pnl_connectome ON connectome_pnl_reports(connectome_id, epoch);
CREATE INDEX IF NOT EXISTS idx_vault_user ON user_vault_stakes(user_address, status);
CREATE INDEX IF NOT EXISTS idx_pred_user ON user_prediction_bets(user_address, round_id);
CREATE INDEX IF NOT EXISTS idx_pred_round ON prediction_rounds(epoch, settled);
CREATE INDEX IF NOT EXISTS idx_copy_user ON user_copy_trades(user_address, status);

-- Seed 16 connectomes + 18 wallets
INSERT OR IGNORE INTO connectomes (id, species, n_neurons, n_synapses, resolution, wallet_id, r2_weights_key, r2_meta_key, status, created_at) VALUES
  ('celegans',     'C. elegans',              302,     6393,    'single-neuron', NULL, 'celegans/weights.npz',     'celegans/brain.npz',     'pending', strftime('%s','now')),
  ('larva',        'Drosophila larva',        3000,    NULL,    'single-neuron', NULL, 'larva/weights.npz',        'larva/brain.npz',        'pending', strftime('%s','now')),
  ('hemibrain',    'Drosophila (CB)',         22500,   NULL,    'single-neuron', NULL, 'hemibrain/weights.npz',    'hemibrain/brain.npz',    'pending', strftime('%s','now')),
  ('banc',         'Drosophila (BANC)',       40000,   NULL,    'single-neuron', NULL, 'banc/weights.npz',         'banc/brain.npz',         'pending', strftime('%s','now')),
  ('manc',         'Drosophila (NC)',         20000,   NULL,    'single-neuron', NULL, 'manc/weights.npz',         'manc/brain.npz',         'pending', strftime('%s','now')),
  ('fafb-cb',      'Drosophila (FAFB-cb)',    25000,   NULL,    'single-neuron', NULL, 'fafb-cb/weights.npz',      'fafb-cb/brain.npz',      'pending', strftime('%s','now')),
  ('malecns',      'Drosophila (MaleCNS)',    166700,  5122492, 'single-neuron', NULL, 'weights.npz',              'brain.npz',              'active',  strftime('%s','now')),
  ('ciona',        'Ciona intestinalis',     177,     6618,    'single-neuron', NULL, 'ciona/weights.npz',        'ciona/brain.npz',        'pending', strftime('%s','now')),
  ('medulla',      'Drosophila medulla',      379,     8637,    'single-neuron', NULL, 'medulla/weights.npz',      'medulla/brain.npz',      'pending', strftime('%s','now')),
  ('mretina',      'Mouse retina',           950,     NULL,    'single-neuron', NULL, 'mretina/weights.npz',      'mretina/brain.npz',      'pending', strftime('%s','now')),
  ('platynereis',  'Platynereis dumerilii',  1500,    NULL,    'single-neuron', NULL, 'platynereis/weights.npz',  'platynereis/brain.npz',  'pending', strftime('%s','now')),
  ('cat-cortex',   'Cat cortex',              6500,    1139,   'region-level',  NULL, 'cat-cortex/weights.npz',   'cat-cortex/brain.npz',   'pending', strftime('%s','now')),
  ('macaque',      'Macaque cortex',          24200,   NULL,    'region-level',  NULL, 'macaque/weights.npz',      'macaque/brain.npz',      'pending', strftime('%s','now')),
  ('marmoset',     'Marmoset cortex',         11600,   NULL,    'region-level',  NULL, 'marmoset/weights.npz',     'marmoset/brain.npz',     'pending', strftime('%s','now')),
  ('allen-mouse',  'Allen Mouse Brain',       24400,   NULL,    'region-level',  NULL, 'allen-mouse/weights.npz',  'allen-mouse/brain.npz',  'pending', strftime('%s','now')),
  ('microns',      'MICrONS portion 65',      25000,   NULL,    'single-neuron', NULL, 'microns/weights.npz',      'microns/brain.npz',      'pending', strftime('%s','now'));

-- Seed 18 wallets: 16 individual ($1 each) + 1 global ($10) + 1 meta ($10)
INSERT OR IGNORE INTO wallets (id, connectome_id, wallet_type, balance_usd, starting_balance, status, created_at) VALUES
  (1,  'celegans',     'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (2,  'larva',        'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (3,  'hemibrain',    'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (4,  'banc',         'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (5,  'manc',         'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (6,  'fafb-cb',      'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (7,  'malecns',      'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (8,  'ciona',        'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (9,  'medulla',      'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (10, 'mretina',      'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (11, 'platynereis',  'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (12, 'cat-cortex',   'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (13, 'macaque',      'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (14, 'marmoset',     'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (15, 'allen-mouse',  'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (16, 'microns',      'individual', 1.0, 1.0, 'active', strftime('%s','now')),
  (17, NULL,           'global',      10.0, 10.0, 'active', strftime('%s','now')),
  (18, NULL,           'meta',        10.0, 10.0, 'active', strftime('%s','now'));

-- Link wallets to connectomes
UPDATE connectomes SET wallet_id = 1 WHERE id = 'celegans';
UPDATE connectomes SET wallet_id = 2 WHERE id = 'larva';
UPDATE connectomes SET wallet_id = 3 WHERE id = 'hemibrain';
UPDATE connectomes SET wallet_id = 4 WHERE id = 'banc';
UPDATE connectomes SET wallet_id = 5 WHERE id = 'manc';
UPDATE connectomes SET wallet_id = 6 WHERE id = 'fafb-cb';
UPDATE connectomes SET wallet_id = 7 WHERE id = 'malecns';
UPDATE connectomes SET wallet_id = 8 WHERE id = 'ciona';
UPDATE connectomes SET wallet_id = 9 WHERE id = 'medulla';
UPDATE connectomes SET wallet_id = 10 WHERE id = 'mretina';
UPDATE connectomes SET wallet_id = 11 WHERE id = 'platynereis';
UPDATE connectomes SET wallet_id = 12 WHERE id = 'cat-cortex';
UPDATE connectomes SET wallet_id = 13 WHERE id = 'macaque';
UPDATE connectomes SET wallet_id = 14 WHERE id = 'marmoset';
UPDATE connectomes SET wallet_id = 15 WHERE id = 'allen-mouse';
UPDATE connectomes SET wallet_id = 16 WHERE id = 'microns';
