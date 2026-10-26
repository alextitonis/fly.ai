/**
 * Pruning on a real server: finished screen jobs older than PRUNE_AFTER_HOURS are summed into screen_sums and
 * deleted, and nothing anyone sees changes: /api/results reports the pruned jobs' and the checked jobs' rates and
 * per-seed spread (from screen_sums, schema 22), every miner keeps its credit, the job totals in /api/stats hold, and
 * canaries, paid jobs and recent jobs stay. A mining order's jobs older than
 * RETAIN_DAYS are emptied in place (their order_tasks rows keep pointing at them: deleting them failed on that foreign
 * key and rolled every run back, 2026-10-03), but not a recent one or one a paid order shares.
 *
 *   npm run test:prune
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { loadModel } from "./load.ts";
import { startPg } from "./pgtest.ts";
import type { TaskParams, TaskResult } from "./runner.ts";
import { addSpread, emptySpread, screenKey, screenRates, spreadSd, type Spread } from "./screensum.ts";

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
const PG = await startPg(5536);
async function start(): Promise<void> {
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, BLOBS_DIR: BLOBS, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "60", PRUNE_AFTER_HOURS: "1", RETAIN_DAYS: "0.04" },
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
  await stop();
  let statsBefore: { tasks: number; tasks_done: number };
  // the totals /api/stats shows, from the database itself: the page's own counts are worked out in the background
  {
    const r = new DatabaseSync(DB, { readOnly: true });
    const n = (sql: string) => (r.prepare(sql).get() as { n: number }).n;
    const pruned = n("select coalesce((select n from counters where name = 'pruned_tasks'), 0) as n");
    statsBefore = { tasks: n("select count(*) as n from tasks") + pruned, tasks_done: n("select count(*) as n from tasks where state = 'done'") + pruned };
    r.close();
  }

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
  // a finished mining order: six old jobs, one old job a paid order shares, one recent job (program jobs, as in production)
  const mineOld = done.slice(2, 8), shared = done[8];
  rw.prepare(`insert into orders (id, wallet, spec, jobs, bid_wei, budget_wei, tag, max_parallel, status, created_at, expires_at, house, label)
    values ('mining-order', '0x0000000000000000000000000000000000000001', '{}', 8, '0', '0', 1, 1, 'done', 0, 0, 1, 'mining/test')`).run();
  for (const id of [...mineOld, shared, recent[0]]) rw.prepare("insert into order_tasks (order_id, task, state) values ('mining-order', ?, 2)").run(id);
  rw.prepare("insert into order_tasks (order_id, task, state) values ('test-order', ?, 2)").run(shared);
  rw.prepare(`update tasks set kind = 'wasm' where id in (${[...mineOld, shared].join(",")})`).run();
  const creditBefore = JSON.stringify(rw.prepare("select * from day_credit order by day, miner").all());
  // three seeds of one stimulus, so a spread has something to measure (a round spreads its seeds over the whole grid)
  for (const [i, id] of done.slice(10, 12).entries()) {
    rw.prepare("update tasks set params = json_set((select params from tasks where id = ?), '$.seed', ?) where id = ?").run(done[9], 900_000 + i, id);
  }
  // what pruning folds: the old screen jobs outside any order, with their answer (no checked job among them)
  const folded = rw.prepare(`select t.params, (select a.result from assignments a join miners m on m.id = a.miner
      where a.task = t.id and (a.status = 'accepted' or (a.status = 'pending' and m.strikes = 0)) limit 1) as result
    from tasks t where t.state = 'done' and t.kind = 'connectome' and t.truth is null and t.id not in (${recent.join(",")})
      and not exists (select 1 from order_tasks ot where ot.task = t.id)`).all() as { params: string; result: string | null }[];
  rw.close();
  await start();

  for (let i = 0; ; i++) {
    const ro = new DatabaseSync(DB, { readOnly: true });
    const pruned = (ro.prepare("select n from counters where name = 'pruned_tasks'").get() as { n: number } | undefined)?.n ?? 0;
    ro.close();
    if (pruned) break;
    if (i > 60) throw new Error("nothing was pruned");
    await sleep(1000);
  }
  for (let i = 0; ; i++) {
    const r = new DatabaseSync(DB, { readOnly: true });
    const emptied = (r.prepare("select count(*) as n from tasks where params like 'pruned:%'").get() as { n: number }).n;
    r.close();
    if (emptied) break;
    if (i > 60) throw new Error("no mining job was emptied");
    await sleep(1000);
  }
  await sleep(1000);
  const ro = new DatabaseSync(DB, { readOnly: true });
  const left = new Set((ro.prepare("select id from tasks where state = 'done'").all() as { id: number }[]).map((r) => r.id));
  const pruned = (ro.prepare("select n from counters where name = 'pruned_tasks'").get() as { n: number }).n;
  check("old finished jobs are pruned", pruned === done.length - 12, `${pruned} of ${done.length}`);
  check("their assignments go with them", !(ro.prepare(`select 1 from assignments where task not in (select id from tasks)`).get()));
  check("recent jobs stay", recent.every((id) => left.has(id)));
  check("the canary stays", left.has(canary));
  check("the paid job stays", left.has(paid));
  const params = (id: number) => (ro.prepare("select params from tasks where id = ?").get(id) as { params: string } | undefined)?.params;
  const answers = (id: number) => (ro.prepare("select count(*) as n from assignments where task = ?").get(id) as { n: number }).n;
  check("old mining jobs are emptied in place", mineOld.every((id) => params(id) === `pruned:${id}` && answers(id) === 0),
    mineOld.map((id) => `${params(id)?.slice(0, 12)}/${answers(id)}`).join(" "));
  check("their order_tasks rows stay", (ro.prepare("select count(*) as n from order_tasks where order_id = 'mining-order'").get() as { n: number }).n === 8);
  check("a job a paid order shares stays whole", !params(shared)!.startsWith("pruned:") && answers(shared) > 0);
  check("a recent mining job stays whole", !params(recent[0])!.startsWith("pruned:") && answers(recent[0]) > 0);
  check("no miner loses credit", JSON.stringify(ro.prepare("select * from day_credit order by day, miner").all()) === creditBefore);
  ro.close();

  // the background count lands a moment after the start; the minute's cache then holds it
  let statsAfter: any = null;
  for (let i = 0; i < 60 && statsAfter?.tasks_done == null; i++) {
    statsAfter = (await api("/api/stats")).json;
    if (statsAfter.tasks_done == null) await new Promise((r) => setTimeout(r, 1000));
  }
  // pruned jobs still count; never fewer (the verifier works open jobs itself after the restart, so it can be more)
  check("job totals in /api/stats hold", statsAfter.tasks_done >= statsBefore.tasks_done && statsAfter.tasks >= statsBefore.tasks,
    `${statsBefore.tasks_done} -> ${statsAfter.tasks_done}`);
  // the summary is 10 minutes old at most: restart so the next request works it out from screen_sums. The verifier
  // checks open jobs of its own meanwhile, and checked jobs count too, so the expectation reads them after the summary
  await stop();
  await start();
  const model = loadModel(fileURLToPath(new URL("../../world/public/connectome/", import.meta.url)));
  let got: any = null, want = new Map<string, { seeds: number; checked: number; base: number[]; stim: number[]; spread: Spread }>();
  for (let attempt = 0; attempt < 5; attempt++) {
    got = await results();
    const r = new DatabaseSync(DB, { readOnly: true });
    const checkedRows = r.prepare(`select params, truth as result from tasks t where truth is not null and kind = 'connectome'
      and not exists (select 1 from order_tasks ot where ot.task = t.id)`).all() as { params: string; result: string }[];
    r.close();
    want = new Map();
    for (const [rows, isChecked] of [[folded, 0], [checkedRows, 1]] as const) {
      for (const row of rows) {
        if (!row.result) continue;
        const { key, params } = screenKey(JSON.parse(row.params) as TaskParams);
        const rates = screenRates(params, JSON.parse(row.result) as TaskResult, model.outputSizes, model.meta.params.dt);
        const w = want.get(key) ?? { seeds: 0, checked: 0, base: rates.base.map(() => 0), stim: rates.stim.map(() => 0), spread: emptySpread(rates.base.length) };
        w.seeds++;
        w.checked += isChecked;
        rates.base.forEach((x, g) => { w.base[g] += x; });
        rates.stim.forEach((x, g) => { w.stim[g] += x; });
        addSpread(w.spread, rates);
        want.set(key, w);
      }
    }
    const seedsGot = (got.rows as any[]).reduce((a, row) => a + row.seeds, 0);
    const seedsWant = [...want.values()].reduce((a, w) => a + w.seeds, 0);
    if (seedsGot === seedsWant) break; // else the verifier checked a job in between: read both again
  }
  const near = (a: number[] | null, b: number[] | null, tol: number) => !!a && !!b && a.length === b.length && a.every((x, g) => Math.abs(x - b[g]) < tol);
  const rows = got.rows as any[];
  let meansOk = rows.length === want.size, sdOk = rows.length === want.size, checkedOk = rows.length === want.size, withSd = 0;
  for (const row of rows) {
    const { seeds: _s, checked_seeds: _c, base_hz: _b, stim_hz: _t, spread_seeds: _n, base_sd_hz: _bs, stim_sd_hz: _ss, ...params } = row;
    const w = want.get(JSON.stringify(params));
    if (!w) { meansOk = sdOk = checkedOk = false; continue; }
    meansOk &&= row.seeds === w.seeds && near(row.base_hz, w.base.map((x) => x / w.seeds), 0.011) && near(row.stim_hz, w.stim.map((x) => x / w.seeds), 0.011);
    checkedOk &&= row.checked_seeds === w.checked;
    const sdBase = spreadSd(w.spread.n, w.spread.base, w.spread.base2), sdStim = spreadSd(w.spread.n, w.spread.stim, w.spread.stim2);
    sdOk &&= row.spread_seeds === w.seeds && (sdBase === null ? row.base_sd_hz === null : near(row.base_sd_hz, sdBase, 0.0011))
      && (sdStim === null ? row.stim_sd_hz === null : near(row.stim_sd_hz, sdStim, 0.0011));
    if (row.base_sd_hz) withSd++;
  }
  check("/api/results reports the pruned and checked jobs' rates from screen_sums", meansOk && rows.length > 0, `${rows.length} stimuli, ${want.size} expected`);
  check("checked seeds are counted", checkedOk);
  check("/api/results reports the per-seed spread", sdOk && withSd > 0, `${withSd} stimuli with a spread`);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  await stop();
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  rmSync(BLOBS, { recursive: true, force: true });
}
console.log(failed ? `${failed} check(s) failed` : "all pruning checks passed");
process.exit(failed ? 1 : 0);
