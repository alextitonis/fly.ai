/**
 * The move to Postgres (2026-09-29): on the first start with MINE_PG_URL, the mining process copies the players' and
 * money tables from the SQLite file into Postgres before anything is served, in one transaction, and checks every row
 * count and every wallet's balance came across exactly; if not, nothing is kept and the server doesn't start. A
 * marker (mine.meta 'copied_from_sqlite') makes it once only. The SQLite tables stay where they were, unused, as the
 * backup. Without the copy, FlightPass would see every pass as new and prefund it again.
 */
import type { DatabaseSync } from "node:sqlite";
import type { Pg, Q } from "./pg.ts";

/** Parents before children (snapshot_claims refers to snapshots). */
const TABLES = [
  "sessions", "ledger", "withdraw_requests", "earnings", "snapshots", "snapshot_claims", "stake_samples",
  "roulette_commits", "roulette_games", "roulette_events", "roulette_terms",
  "flightpass", "flightpass_withdrawals", "flightpass_days", "flightpass_owners",
  "slots_commits", "slots_spins", "race_commits", "race_games", "race_events",
];
/** tables whose ids Postgres hands out (identity columns): the sequence continues after the copied ones */
const IDENTITY = ["ledger", "withdraw_requests", "flightpass_withdrawals"];
const MARKER = "copied_from_sqlite";

function balances(rows: { wallet: string; kind: string; amount_wei: string }[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const r of rows) {
    const sign = ["deposit", "release", "payout", "prefund"].includes(r.kind) ? 1n : ["fund", "withdraw", "bet", "fee"].includes(r.kind) ? -1n : 0n;
    out.set(r.wallet, (out.get(r.wallet) ?? 0n) + sign * BigInt(r.amount_wei));
  }
  return out;
}

async function copyTable(db: DatabaseSync, q: Q, table: string): Promise<number> {
  const pgCols = new Set((await q.all<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'mine' and table_name = ?", table)).map((c) => c.column_name));
  const cols = (db.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((c) => c.name).filter((c) => pgCols.has(c));
  const missing = [...pgCols].filter((c) => c !== "ref" && !cols.includes(c));
  if (missing.length) console.log(`copying ${table}: ${missing.join(", ")} not in SQLite, left to their defaults`);
  // well under Postgres' 65,535 parameters a statement
  const per = Math.max(1, Math.floor(20_000 / cols.length));
  let copied = 0, rows: Record<string, string | number | null>[] = [];
  const flush = async () => {
    if (!rows.length) return;
    const values = rows.map(() => `(${cols.map(() => "?").join(", ")})`).join(", ");
    await q.run(`insert into mine.${table} (${cols.join(", ")}) values ${values}`, ...rows.flatMap((r) => cols.map((c) => r[c] ?? null)));
    copied += rows.length;
    rows = [];
  };
  for (const r of db.prepare(`select ${cols.join(", ")} from ${table}`).iterate() as Iterable<Record<string, string | number | null>>) {
    rows.push(r);
    if (rows.length >= per) await flush();
  }
  await flush();
  return copied;
}

export async function copyLegacy(db: DatabaseSync, pg: Pg): Promise<void> {
  if (await pg.one("select 1 from mine.meta where key = ?", MARKER)) return;
  const present = TABLES.filter((t) => db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(t));
  const started = Date.now();
  await pg.tx(async (q) => {
    for (const t of TABLES) {
      if (await q.one(`select 1 from mine.${t} limit 1`)) throw new Error(`mine.${t} in Postgres already has rows, and there's no copy marker: not copying over them`);
    }
    for (const t of present) {
      const n = await copyTable(db, q, t);
      const there = (await q.one<{ n: number }>(`select count(*) as n from mine.${t}`))!.n;
      const here = (db.prepare(`select count(*) as n from ${t}`).get() as { n: number }).n;
      if (there !== here || n !== here) throw new Error(`copying ${t}: ${here} rows in SQLite, ${there} in Postgres`);
      if (IDENTITY.includes(t)) await q.run(`select setval(pg_get_serial_sequence('mine.${t}', 'id'), coalesce((select max(id) from mine.${t}), 0) + 1, false)`);
      console.log(`copied ${t}: ${n} rows`);
    }
    if (present.includes("ledger")) {
      const here = balances(db.prepare("select wallet, kind, amount_wei from ledger").all() as any[]);
      const there = balances(await q.all("select wallet, kind, amount_wei from mine.ledger"));
      for (const [wallet, b] of here) {
        if (there.get(wallet) !== b) throw new Error(`copying the ledger: ${wallet} has ${b} wei in SQLite, ${there.get(wallet)} in Postgres`);
      }
      if (there.size !== here.size) throw new Error(`copying the ledger: ${here.size} wallets in SQLite, ${there.size} in Postgres`);
      console.log(`ledger checked: ${here.size} balances match`);
    }
    await q.run("insert into mine.meta (key, value) values (?, ?)", MARKER, JSON.stringify({ at: Date.now(), tables: present }));
  });
  console.log(`players and money copied to Postgres (${present.length} tables, ${Math.round((Date.now() - started) / 1000)} s)`);
}
