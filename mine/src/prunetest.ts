/**
 * Pruning on a real server: finished screen jobs older than PRUNE_AFTER_HOURS are summed into screen_sums and
 * deleted, and nothing anyone sees changes: /api/results reports the same rates, every miner keeps its credit, the
 * job totals in /api/stats hold, and canaries, paid jobs and recent jobs stay.
 *
 *   npm run test:prune
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const PORT = 8785;
const BASE = `http://localhost:${PORT}`;
const DB = join(tmpdir(), `mine-prunetest-${process.pid}.db`);
const BLOBS = join(tmpdir(), `mine-prunetest-blobs-${process.pid}`);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const api = async (path: string, body?: unknown, auth?: string) => {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) as any };
};

let server: ReturnType<typeof spawn> | null = null;
async function start(): Promise<void> {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: DB, BLOBS_DIR: BLOBS, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "60", PRUNE_AFTER_HOURS: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }
}
async function stop(): Promise<void> {
  if (!server) return;
  const s = server;
  server = null;
  const gone = new Promise((r) => s.once("exit", r));
  s.kill();
  await gone;
}
/** /api/results once the worker has a summary (it starts one on the first request). */
async function results(): Promise<any> {
  for (let i = 0; i < 120; i++) {
    const r = (await api("/api/results")).json;
    if (!r.computing) return r;
    await sleep(500);
  }
  throw new Error("results never finished");
}

try {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  await start();
  const groups = (await api("/api/results")).json.outputs.length as number;
  const register = async () => (await api("/api/register", {})).json.token as string;
  const miners = [await register(), await register()];
  // fake but well-formed answers: the server doesn't check them (AUDITS=0, CANARY_RATE=0), so they stay pending
  let n = 0;
  const answer = () => {
    n++;
    return { hash: n.toString(16).padStart(16, "0"), spikes: n * 7, base: Array.from({ length: groups }, (_, g) => (n * 3 + g) % 11), stim: Array.from({ length: groups }, (_, g) => (n * 5 + g * 2) % 13) };
  };
  for (const token of miners) {
    for (let round = 0; round < 3; round++) {
      const jobs = (await api("/api/claim", { count: 8 }, token)).json.jobs as { job: string }[];
      for (const j of jobs) check("an answer is taken", (await api("/api/submit", { job: j.job, result: answer() }, token)).status === 200);
    }
  }
  const statsBefore = (await api("/api/stats")).json;
  await stop();

  // age every finished job but three, and set one old job aside as a canary and one as a paid job
  const rw = new DatabaseSync(DB, { enableForeignKeyConstraints: false }); // a paid job with no order behind it
  const done = (rw.prepare("select id from tasks where state = 'done' and kind = 'connectome' order by id").all() as { id: number }[]).map((r) => r.id);
  check("miners finished jobs", done.length >= 40, String(done.length));
  const recent = done.slice(-3);
  const [canary, paid] = done;
  rw.prepare(`update assignments set issued_at = issued_at - 7200000, submitted_at = submitted_at - 7200000, expires_at = expires_at - 7200000
    where task not in (${recent.join(",")})`).run();
  const canaryResult = (rw.prepare("select result from assignments where task = ?").get(canary) as { result: string }).result;
  rw.prepare("update tasks set truth = ?, checked_at = ? where id = ?").run(canaryResult, Date.now(), canary);
  rw.prepare("insert into order_tasks (order_id, task, state) values ('test-order', ?, 2)").run(paid);
  const creditBefore = JSON.stringify(rw.prepare("select * from day_credit order by day, miner").all());
  rw.close();
  await start();
  const resultsBefore = await results(); // worked out before the first prune (it starts on the 15 s tick)

  for (let i = 0; ; i++) {
    const ro = new DatabaseSync(DB, { readOnly: true });
    const pruned = (ro.prepare("select n from counters where name = 'pruned_tasks'").get() as { n: number } | undefined)?.n ?? 0;
    ro.close();
    if (pruned) break;
    if (i > 60) throw new Error("nothing was pruned");
    await sleep(1000);
  }
  await sleep(1000);
  const ro = new DatabaseSync(DB, { readOnly: true });
  const left = new Set((ro.prepare("select id from tasks where state = 'done'").all() as { id: number }[]).map((r) => r.id));
  const pruned = (ro.prepare("select n from counters where name = 'pruned_tasks'").get() as { n: number }).n;
  check("old finished jobs are pruned", pruned === done.length - 5, `${pruned} of ${done.length}`);
  check("their assignments go with them", !(ro.prepare(`select 1 from assignments where task not in (select id from tasks)`).get()));
  check("recent jobs stay", recent.every((id) => left.has(id)));
  check("the canary stays", left.has(canary));
  check("the paid job stays", left.has(paid));
  check("no miner loses credit", JSON.stringify(ro.prepare("select * from day_credit order by day, miner").all()) === creditBefore);
  ro.close();

  const statsAfter = (await api("/api/stats")).json;
  check("job totals in /api/stats hold", statsAfter.tasks_done === statsBefore.tasks_done && statsAfter.tasks >= statsBefore.tasks,
    `${statsBefore.tasks_done} -> ${statsAfter.tasks_done}`);
  // the summary is 10 minutes old at most: restart so the next request works it out from screen_sums
  await stop();
  await start();
  const resultsAfter = await results();
  const byKey = (r: any) => new Map((r.rows as any[]).map((row) => {
    const { seeds: _s, checked_seeds: _c, base_hz: _b, stim_hz: _t, ...params } = row;
    return [JSON.stringify(params), row];
  }));
  const a = byKey(resultsBefore), b = byKey(resultsAfter);
  const same = a.size === b.size && [...a].every(([k, row]) => {
    const other = b.get(k);
    return other && other.seeds === row.seeds && other.base_hz.every((x: number, g: number) => Math.abs(x - row.base_hz[g]) < 0.011)
      && other.stim_hz.every((x: number, g: number) => Math.abs(x - row.stim_hz[g]) < 0.011);
  });
  check("/api/results reports the same rates from screen_sums", same && a.size > 0, `${a.size} stimuli before, ${b.size} after`);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  await stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  rmSync(BLOBS, { recursive: true, force: true });
}
console.log(failed ? `${failed} check(s) failed` : "all pruning checks passed");
process.exit(failed ? 1 : 0);
