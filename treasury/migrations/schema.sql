-- SHIT Token D1 Schema
-- Cloudflare D1 (SQLite) — free tier: 5GB, 5M reads/day, 100K writes/day

-- Token discovery
CREATE TABLE IF NOT EXISTS tokens (
  address TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT,
  chain TEXT DEFAULT 'robinhood',
  launchpad TEXT,
  pair_address TEXT,
  factory_address TEXT,
  creator_address TEXT,
  first_seen INTEGER NOT NULL,
  score REAL DEFAULT 0,
  score_reasons TEXT,
  enriched_at INTEGER,
  ignored INTEGER DEFAULT 0,
  risk_flags TEXT
);

-- Enrichment data (DexScreener, RugCheck, Etherscan, etc.)
CREATE TABLE IF NOT EXISTS enrichment (
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  data TEXT NOT NULL,
  enriched_at TEXT NOT NULL,
  PRIMARY KEY (chain, address)
);

-- Fly brain decisions
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_address TEXT NOT NULL,
  decision TEXT NOT NULL,
  confidence REAL DEFAULT 0,
  neural_activity TEXT,
  feature_snapshot TEXT,
  score REAL DEFAULT 0,
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signals_token ON signals(token_address);
CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at DESC);

-- Positions
CREATE TABLE IF NOT EXISTS positions (
  token_address TEXT PRIMARY KEY,
  symbol TEXT,
  launchpad TEXT,
  entry_price REAL,
  entry_amount REAL,
  entry_tx TEXT,
  entry_at INTEGER,
  current_price REAL,
  pnl_percent REAL DEFAULT 0,
  status TEXT DEFAULT 'open',
  exit_price REAL,
  exit_tx TEXT,
  exit_at INTEGER,
  flyai_accumulated REAL DEFAULT 0
);

-- Trades (audit trail)
CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_address TEXT NOT NULL,
  symbol TEXT,
  action TEXT NOT NULL,
  amount REAL,
  price REAL,
  tx_hash TEXT,
  flyai_bought REAL DEFAULT 0,
  profit REAL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_address);
CREATE INDEX IF NOT EXISTS idx_trades_created ON trades(created_at DESC);

-- FLYAI treasury balance tracking
CREATE TABLE IF NOT EXISTS flyai_treasury (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  balance REAL NOT NULL,
  price_usd REAL,
  total_rfv REAL,
  shit_floor_price REAL,
  updated_at INTEGER NOT NULL
);

-- Audit log (all events)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  data TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- Allowlist (tokens approved for trading)
CREATE TABLE IF NOT EXISTS allowlist (
  address TEXT PRIMARY KEY,
  symbol TEXT,
  added_at INTEGER NOT NULL,
  verified INTEGER DEFAULT 0
);

-- Settings (runtime config)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
