-- Seed D1 with 16 real connectomes + 18 wallets for paper trading
-- Run: npx wrangler d1 execute shit-token --file=migrations/seed_connectomes.sql v2

-- === 16 Connectomes (real published data) ===
INSERT INTO connectomes (id, species, n_neurons, n_synapses, resolution, r2_weights_key, r2_meta_key, source, status, created_at) VALUES
  ('celegans',       'C. elegans',         302,    3009,    'single-neuron', 'celegans/weights.npz',       'celegans/brain.npz',       'Varshney et al. 2011',          'active', 1694524800),
  ('drosophila',     'D. melanogaster',    49,     1950,    'region-level',  'drosophila/weights.npz',     'drosophila/brain.npz',     'Chiang et al. 2011',            'active', 1694524800),
  ('human',          'H. sapiens',         234,    7076,    'region-level',  'human/weights.npz',         'human/brain.npz',         'Griffa et al. 2019',            'active', 1694524800),
  ('macaque',        'M. mulatta',         93,     1692,    'region-level',  'macaque/weights.npz',       'macaque/brain.npz',        'Markov et al. 2013',            'active', 1694524800),
  ('macaque_modha',  'M. mulatta',         242,    4090,    'region-level',  'macaque_modha/weights.npz', 'macaque_modha/brain.npz',  'Modha & Singh 2010',            'active', 1694524800),
  ('mouse',          'M. musculus',        112,    6542,    'region-level',  'mouse/weights.npz',         'mouse/brain.npz',          'Rubinov et al. 2015',           'active', 1694524800),
  ('rat',            'R. norvegicus',      73,     1923,    'region-level',  'rat/weights.npz',           'rat/brain.npz',            'Bota et al. 2015',              'active', 1694524800),
  ('malecns',        'D. melanogaster',    166700, 25582938,'single-neuron', 'weights.npz',                'brain.npz',                'Berg et al. 2025 MaleCNS',      'active', 1694524800),
  ('hemibrain',      'D. melanogaster',    21636,  216310,  'single-neuron', 'hemibrain/weights.npz',     'hemibrain/brain.npz',      'Scheffer et al. 2020',          'active', 1694524800),
  ('medulla',        'D. melanogaster',    40000,  399950,  'single-neuron', 'medulla/weights.npz',       'medulla/brain.npz',        'Takemura et al. 2013',          'active', 1694524800),
  ('mouse_retina',   'M. musculus',        1124,   90009,   'single-neuron', 'mouse_retina/weights.npz',  'mouse_retina/brain.npz',   'Helmstaedter et al. 2013',      'active', 1694524800),
  ('platynereis',    'P. dumerilii',       5000,   49991,   'single-neuron', 'platynereis/weights.npz',   'platynereis/brain.npz',    'Randel et al. 2014',            'active', 1694524800),
  ('ciona',          'C. intestinalis',    205,    2902,    'single-neuron', 'ciona/weights.npz',         'ciona/brain.npz',          'Ryan et al. 2016',              'active', 1694524800),
  ('larva',          'D. melanogaster',    3016,   30149,   'single-neuron', 'larva/weights.npz',         'larva/brain.npz',          'Drosophila larva 2023',         'active', 1694524800),
  ('celegans_herm',  'C. elegans',         453,    4878,    'single-neuron', 'celegans_herm/weights.npz', 'celegans_herm/brain.npz',  'Cook et al. 2019 herm',         'active', 1694524800),
  ('celegans_male',  'C. elegans',         575,    5305,    'single-neuron', 'celegans_male/weights.npz', 'celegans_male/brain.npz', 'Cook et al. 2019 male',         'active', 1694524800);

-- === 16 Individual wallets (one per connectome) ===
-- Each starts with $10.00 paper balance
INSERT INTO wallets (id, connectome_id, wallet_type, balance_usd, starting_balance, total_pnl, n_trades, n_wins, created_at) VALUES
  (1,  'celegans',      'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (2,  'drosophila',    'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (3,  'human',         'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (4,  'macaque',       'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (5,  'macaque_modha', 'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (6,  'mouse',         'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (7,  'rat',           'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (8,  'malecns',       'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (9,  'hemibrain',     'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (10, 'medulla',       'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (11, 'mouse_retina',  'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (12, 'platynereis',   'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (13, 'ciona',         'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (14, 'larva',         'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (15, 'celegans_herm', 'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800),
  (16, 'celegans_male', 'individual', 10.0, 10.0, 0.0, 0, 0, 1694524800);

-- === Global wallet (majority vote across all connectomes) ===
INSERT INTO wallets (id, connectome_id, wallet_type, balance_usd, starting_balance, total_pnl, n_trades, n_wins, created_at) VALUES
  (17, NULL, 'global', 100.0, 100.0, 0.0, 0, 0, 1694524800);

-- === Meta wallet (AUC-weighted across all connectomes) ===
INSERT INTO wallets (id, connectome_id, wallet_type, balance_usd, starting_balance, total_pnl, n_trades, n_wins, created_at) VALUES
  (18, NULL, 'meta', 100.0, 100.0, 0.0, 0, 0, 1694524800);

-- === Link connectomes to their wallet IDs ===
UPDATE connectomes SET wallet_id = 1 WHERE id = 'celegans';
UPDATE connectomes SET wallet_id = 2 WHERE id = 'drosophila';
UPDATE connectomes SET wallet_id = 3 WHERE id = 'human';
UPDATE connectomes SET wallet_id = 4 WHERE id = 'macaque';
UPDATE connectomes SET wallet_id = 5 WHERE id = 'macaque_modha';
UPDATE connectomes SET wallet_id = 6 WHERE id = 'mouse';
UPDATE connectomes SET wallet_id = 7 WHERE id = 'rat';
UPDATE connectomes SET wallet_id = 8 WHERE id = 'malecns';
UPDATE connectomes SET wallet_id = 9 WHERE id = 'hemibrain';
UPDATE connectomes SET wallet_id = 10 WHERE id = 'medulla';
UPDATE connectomes SET wallet_id = 11 WHERE id = 'mouse_retina';
UPDATE connectomes SET wallet_id = 12 WHERE id = 'platynereis';
UPDATE connectomes SET wallet_id = 13 WHERE id = 'ciona';
UPDATE connectomes SET wallet_id = 14 WHERE id = 'larva';
UPDATE connectomes SET wallet_id = 15 WHERE id = 'celegans_herm';
UPDATE connectomes SET wallet_id = 16 WHERE id = 'celegans_male';

-- === Paper trading settings ===
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('paper_trading_enabled', 'true'),
  ('starting_balance', '10.0'),
  ('global_starting_balance', '100.0'),
  ('meta_starting_balance', '100.0'),
  ('max_position_pct', '20.0'),
  ('epoch_interval_minutes', '2'),
  ('exploration_rate', '0.07');
