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
CREATE TABLE IF NOT EXISTS whitelist_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL UNIQUE,
  signature TEXT NOT NULL,
  twitter TEXT DEFAULT '',
  bluesky TEXT DEFAULT '',
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_whitelist_address ON whitelist_entries(address);
`;
