-- Schema v4: Real trading support
-- Adds tx_hash, is_real, flyai_buy_tx columns to paper_trades for on-chain trade tracking

-- Add real trade tracking columns to paper_trades (created at runtime in v1)
ALTER TABLE paper_trades ADD COLUMN tx_hash TEXT;
ALTER TABLE paper_trades ADD COLUMN is_real INTEGER DEFAULT 0;
ALTER TABLE paper_trades ADD COLUMN flyai_buy_tx TEXT;
ALTER TABLE paper_trades ADD COLUMN flyai_amount REAL;

-- On-chain RFV update tracking
CREATE TABLE IF NOT EXISTS rfv_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rfv REAL NOT NULL,
  nav REAL,
  floor_price REAL,
  roots_supply REAL,
  tx_hash TEXT,
  updated_at INTEGER NOT NULL
);
