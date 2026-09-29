/**
 * The move to Postgres (src/legacy.ts): a SQLite file shaped like the live one before schema 21 is copied into
 * a local Postgres once, exactly, and a second start copies nothing. Run: npm run test:legacy
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { copyLegacy } from "./legacy.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`);
};

const dir = mkdtempSync(join(tmpdir(), "mine-legacy-"));
const db = new DatabaseSync(join(dir, "mine.db"));
// as schema 20 made them (server.ts before 2026-09-29)
db.exec(`
  create table sessions (token_hash text primary key, wallet text not null, created_at integer not null, expires_at integer not null);
  create table ledger (id integer primary key, wallet text not null, order_id text, kind text not null, amount_wei text not null,
    pool_wei text, month text, tx text, at integer not null);
  create table snapshots (month text primary key, pool_wei text not null, root text not null, total_points real not null, wallets integer not null, created_at integer not null);
  create table snapshot_claims (month text not null references snapshots(month), wallet text not null, points real not null, amount_wei text not null, proof text not null, primary key (month, wallet));
  create table roulette_events (game text not null, seq integer not null, event text not null, primary key (game, seq)) without rowid;
  create table flightpass_withdrawals (id integer primary key, pass integer not null, wallet text not null, amount_wei text not null, fee_wei text not null,
    status text not null, created_at integer not null, done_at integer, tx text, sending_at integer, error text);
`);
const A = "0x1111111111111111111111111111111111111111", B = "0x2222222222222222222222222222222222222222";
const add = db.prepare("insert into ledger (wallet, order_id, kind, amount_wei, pool_wei, month, tx, at) values (?, ?, ?, ?, ?, ?, ?, ?)");
add.run(A, null, "deposit", "5000000000000000000000", null, null, "0xaa", 1);
add.run(A, null, "bet", "100000000000000000000", null, null, "roulette:g1", 2);
add.run(A, null, "payout", "190000000000000000000", null, null, "roulette-win:g1", 3);
add.run(A, "o1", "fund", "1000000000000000000000", null, null, null, 4);
add.run(A, "o1", "charge", "10000000000000000000", "8000000000000000000", "2026-09", null, 5);
add.run("pass:7", null, "prefund", "13500000000000000000000", null, null, "prefund:7", 6);
add.run("pass:7", null, "fee", "1000000000000000000", null, null, null, 7);
add.run(B, null, "deposit", "1", null, null, "0xbb", 8);
db.prepare("insert into sessions values (?, ?, ?, ?)").run("h".repeat(64), A, 1, 9e12);
db.prepare("insert into snapshots values (?, ?, ?, ?, ?, ?)").run("2026-08", "100", "0xroot", 12.5, 1, 1);
db.prepare("insert into snapshot_claims values (?, ?, ?, ?, ?)").run("2026-08", A, 12.5, "100", "[]");
const ev = db.prepare("insert into roulette_events values (?, ?, ?)");
for (let i = 0; i < 2_500; i++) ev.run(`g${i % 3}`, i, JSON.stringify({ type: "turn", i }));
db.prepare("insert into flightpass_withdrawals (id, pass, wallet, amount_wei, fee_wei, status, created_at) values (41, 7, ?, '99', '1', 'open', 1)").run(A);

const PG = await startPg(5549);
try {
  await copyLegacy(db, PG.pg);
  const n = async (t: string) => (await PG.pg.one<{ n: number }>(`select count(*) as n from mine.${t}`))!.n;
  check("every ledger row copied", await n("ledger") === 8, await n("ledger"));
  check("a table without rowid copied in batches", await n("roulette_events") === 2_500, await n("roulette_events"));
  check("sessions, snapshots and their claims copied", await n("sessions") === 1 && await n("snapshots") === 1 && await n("snapshot_claims") === 1);
  const sum = async (w: string) => {
    let s = 0n;
    for (const r of await PG.pg.all<{ kind: string; amount_wei: string }>("select kind, amount_wei from mine.ledger where wallet = ?", w)) {
      s += (["deposit", "release", "payout", "prefund"].includes(r.kind) ? 1n : ["fund", "withdraw", "bet", "fee"].includes(r.kind) ? -1n : 0n) * BigInt(r.amount_wei);
    }
    return s;
  };
  check("balances as in SQLite", await sum(A) === 4090000000000000000000n && await sum("pass:7") === 13499000000000000000000n && await sum(B) === 1n);
  const id = (await PG.pg.one<{ id: number }>("insert into mine.ledger (wallet, kind, amount_wei, at) values (?, 'deposit', '1', 1) returning id", B))!.id;
  check("new ledger ids continue after the copied ones", id === 9, id);
  const w = (await PG.pg.one<{ id: number }>("insert into mine.flightpass_withdrawals (pass, wallet, amount_wei, fee_wei, status, created_at) values (7, ?, '1', '0', 'open', 1) returning id", A))!.id;
  check("and withdrawal ids too", w === 42, w);
  await copyLegacy(db, PG.pg);
  check("a second start copies nothing", await n("ledger") === 9, await n("ledger"));

  // refuses to copy over rows a start without the marker would otherwise double
  await PG.pg.run("delete from mine.meta");
  let refused = false;
  try { await copyLegacy(db, PG.pg); } catch (err) { refused = /already has rows/.test(String(err)); }
  check("never copies into tables that already have rows", refused);
} finally {
  await PG.stop();
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
