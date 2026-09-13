-- SQLite schema for arbitrage opportunity logging V2

CREATE TABLE IF NOT EXISTS opportunities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    chain           TEXT    NOT NULL,
    token_in        TEXT    NOT NULL,
    token_out       TEXT    NOT NULL,
    buy_dex         TEXT    NOT NULL,
    sell_dex        TEXT    NOT NULL,
    buy_amount_in   INTEGER NOT NULL,
    buy_amount_out  INTEGER NOT NULL,
    sell_amount_in  INTEGER NOT NULL,
    sell_amount_out INTEGER NOT NULL,
    gross_profit_wei   INTEGER NOT NULL,
    net_profit_wei     INTEGER NOT NULL,
    gas_estimate       INTEGER NOT NULL,
    gas_price_wei      INTEGER NOT NULL,
    timestamp          REAL    NOT NULL,
    raw_buy            TEXT,   -- JSON
    raw_sell           TEXT,   -- JSON
    trade_executable    INTEGER DEFAULT 1
);

-- Triangular (3-leg) cyclic arbitrage opportunities
CREATE TABLE IF NOT EXISTS triangular_opportunities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    chain           TEXT    NOT NULL,
    token_a         TEXT    NOT NULL,
    token_b         TEXT    NOT NULL,
    token_c         TEXT    NOT NULL,
    gross_profit_wei  INTEGER NOT NULL,
    net_profit_wei    INTEGER NOT NULL,
    gas_estimate      INTEGER NOT NULL,
    gas_price_wei     INTEGER NOT NULL,
    timestamp         REAL    NOT NULL,
    raw_cycle         TEXT    -- JSON with leg details
);

CREATE INDEX IF NOT EXISTS idx_opp_chain_time ON opportunities(chain, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tri_chain_time ON triangular_opportunities(chain, timestamp DESC);
