/**
 * pg.ts gives up on a query the database doesn't answer and carries on with fresh connections (2026-09-30: the user
 * process's pooled connections went dead and every request that read Postgres hung for good).
 *   npm run test:pg
 */
import { connectPg, PgTimeout } from "./pg.ts";
import { startPg } from "./pgtest.ts";

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}`); if (!ok) failed++; };

const PG = await startPg(54_391);
const pg = connectPg(PG.url, { max: 2, queryTimeoutMs: 800, txTimeoutMs: 1_500 });
try {
  check("a quick query answers", (await pg.one<{ n: number }>("select 1 as n"))?.n === 1);

  // both connections busy with queries that never come back in time, and one more waiting behind them
  const t0 = Date.now();
  const stuck = await Promise.allSettled([pg.one("select pg_sleep(30)"), pg.one("select pg_sleep(30)"), pg.one<{ n: number }>("select 2 as n")]);
  check("stuck queries fail with PgTimeout instead of hanging", stuck[0].status === "rejected" && stuck[0].reason instanceof PgTimeout
    && stuck[1].status === "rejected" && Date.now() - t0 < 5_000);
  check("what queued behind them doesn't hang either", stuck[2].status === "rejected" || (stuck[2].status === "fulfilled" && stuck[2].value?.n === 2));
  check("the next query runs on fresh connections", (await pg.one<{ n: number }>("select 3 as n"))?.n === 3);

  const t1 = Date.now();
  const tx = await pg.tx(async (q) => { await q.run("select pg_sleep(30)"); return "done"; }).catch((err) => err);
  check("a stuck transaction fails too", tx instanceof PgTimeout && Date.now() - t1 < 5_000);
  check("a transaction works afterwards, under a lock", await pg.tx(async (q) => (await q.one<{ n: number }>("select 4 as n"))!.n, "wallet:0xabc") === 4);
  // a transaction's own queries have no limit of their own: a wait shorter than the transaction's is fine
  check("a slow step inside a transaction isn't cut short", await pg.tx(async (q) => { await q.run("select pg_sleep(1)"); return true; }) === true);
} finally {
  await pg.end().catch(() => {});
  await PG.stop();
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
