/**
 * /api/stats' whole-table counts, on their own thread and read-only connection (server.ts starts it, once a minute).
 * On the server's thread they held every request for up to 35 s on ~2M jobs (2026-09-29): the page gets the last
 * finished counts instead, a minute old at most.
 */
import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";

const db = new DatabaseSync(workerData.db as string, { readOnly: true });
db.exec("pragma busy_timeout = 5000");
const count = (sql: string) => Number((db.prepare(sql).get() as { n: number | null }).n ?? 0);
const t0 = Date.now();
// 2026-10-03: count(*) over 35M+ jobs took 9 minutes, and its open read kept the WAL from being checkpointed (it grew
// to 5 GB and every query on the mining thread slowed, then Postgres connects timed out). Every number here is now an
// index seek: ids only grow and pruning never removes the newest, so max(id) is every job ever made (pruned ones
// included) and the done ones are those not open or out (both small, on tasks_open).
const made = count("select coalesce(max(id), 0) as n from tasks");
const notDone = count("select count(*) as n from tasks where state in ('open', 'out')");
parentPort!.postMessage({
  tasks: made,
  tasks_done: Math.max(0, made - notDone),
  tasks_checked: count("select count(*) as n from tasks indexed by tasks_canary where truth is not null"),
  // the newest jobs carry the newest round
  rounds: count("select coalesce(max(round) + 1, 0) as n from (select round from tasks order by id desc limit 20000)"),
  paid_jobs_waiting: count("select count(*) as n from tasks indexed by tasks_paid where state = 'open' and priority > 0"),
  blob_bytes: count("select sum((size + 4095) / 4096 * 4096) as n from blobs"),
  took_ms: Date.now() - t0,
});
db.close();
