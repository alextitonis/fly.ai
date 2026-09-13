export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run<T = unknown>(): Promise<T>;
}

export function getDb(env: Record<string, unknown>): D1Database {
  const db = env.DB as D1Database;
  if (!db) throw new Error("D1 database not configured");
  return db;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS referrals (
  user_address TEXT PRIMARY KEY,
  referrer_address TEXT NOT NULL,
  bound_at INTEGER NOT NULL DEFAULT (unixepoch()),
  tx_hash TEXT
);

CREATE TABLE IF NOT EXISTS fee_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_address TEXT NOT NULL,
  referrer_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  fee_amount TEXT NOT NULL,
  source TEXT NOT NULL,
  tx_hash TEXT,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_fee_records_referrer ON fee_records(referrer_address);
CREATE INDEX IF NOT EXISTS idx_fee_records_referrer_token ON fee_records(referrer_address, token_address);

CREATE TABLE IF NOT EXISTS fee_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  amount_claimed TEXT NOT NULL,
  tx_hash TEXT,
  claimed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_fee_claims_referrer ON fee_claims(referrer_address);
`;
