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
parentPort!.postMessage({
  tasks: count("select count(*) as n from tasks"),
  tasks_done: count("select count(*) as n from tasks where state = 'done'"),
  tasks_checked: count("select count(*) as n from tasks where truth is not null"),
  rounds: count("select coalesce(max(round) + 1, 0) as n from tasks"),
  paid_jobs_waiting: count("select count(*) as n from tasks where priority > 0"),
  blob_bytes: count("select sum((size + 4095) / 4096 * 4096) as n from blobs"),
  took_ms: Date.now() - t0,
});
db.close();
