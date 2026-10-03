/**
 * Tests' Postgres: a real one (embedded-postgres, the Postgres binaries from npm) in a temp directory on a local port,
 * with the Supabase migrations that make the `mine` schema, so a spawned server connects to it as it would to
 * Supabase. Not PGlite: its socket server shares one session between connections and crossed their queries (a
 * server and a test querying at once got each other's parameters, 2026-09-29).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { connectPg, type Pg } from "./pg.ts";

const MIGRATIONS = ["20260929180000_mine_money.sql", "20260930200000_mine_arena.sql", "20260930210000_mine_arena_chain.sql", "20260930220000_mine_arena_fee.sql", "20260930230000_mine_arena_shop.sql", "20261002120000_mine_arena_pass.sql", "20261002180000_mine_vaults.sql", "20261003120000_mine_profiles.sql"]
  .map((name) => new URL(`../../flybook/supabase/migrations/${name}`, import.meta.url));

export async function startPg(port: number): Promise<{ url: string; pg: Pg; stop: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), "mine-pg-"));
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "test", port, persistent: false, onLog: () => {}, onError: (e) => { if (process.env.PG_DEBUG) console.error("pg:", e); } });
  await server.initialise();
  await server.start();
  const url = `postgres://postgres:test@127.0.0.1:${port}/postgres`;
  const pg = connectPg(url, { max: 2 });
  // Supabase has these roles; a plain Postgres doesn't
  await pg.run("create role anon");
  await pg.run("create role authenticated");
  for (const file of MIGRATIONS) for (const statement of splitSql(readFileSync(file, "utf8"))) await pg.run(statement);
  return {
    url, pg,
    stop: async () => {
      await pg.end();
      await server.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** The migration's statements, one at a time: the wrapper sends each as a parameterized query, which takes one only. */
function splitSql(sql: string): string[] {
  return sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n").split(";").map((s) => s.trim()).filter(Boolean);
}
