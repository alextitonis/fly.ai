/**
 * GET /api/results, worked out off the main thread. On 2026-09-21 averaging every done screen job on the main thread
 * took 63 s and, polled once a minute, froze the whole server, so it moved here: its own read-only connection, posts
 * the summary and exits.
 *
 * 2026-10-26: it also re-read every live finished job (the last PRUNE_AFTER_HOURS, ~9M a day by then, each with a
 * sub-query into assignments) and never finished, so /api/results said `computing` from 10-01 on. Now it reads what
 * is already summed: screen_sums (pruned jobs) plus the checked jobs (the server's own answers, which are never pruned),
 * through the tasks_canary_brain index. Jobs not yet pruned show up a day late; at a million seeds a stimulus that
 * changes nothing. Checked jobs stay in tasks, so nothing is counted twice.
 *
 * in:  workerData {db, outputs, outputSizes, dt}
 * out: {units, outputs, rows}
 */
import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import type { TaskParams, TaskResult } from "./runner.ts";
import { addSpread, emptySpread, screenKey, screenRates, spreadSd, type Spread } from "./screensum.ts";

const { outputs, outputSizes, dt } = workerData as { db: string; outputs: string[]; outputSizes: number[]; dt: number };
const db = new DatabaseSync(workerData.db, { readOnly: true });
db.exec("begin");
type Cell = { params: Omit<TaskParams, "seed">; seeds: number; checked: number; base: number[]; stim: number[]; spread: Spread };
const cells = new Map<string, Cell>();
const sums = db.prepare("select key, seeds, base, stim, spread from screen_sums").iterate() as Iterable<{ key: string; seeds: number; base: string; stim: string; spread: string | null }>;
for (const s of sums) {
  cells.set(s.key, { params: JSON.parse(s.key), seeds: s.seeds, checked: 0, base: JSON.parse(s.base), stim: JSON.parse(s.stim),
    spread: s.spread ? JSON.parse(s.spread) : emptySpread(outputs.length) });
}
// a paid order's jobs are the buyer's, as in pruning; a disputed truth has no single answer
const checked = db.prepare(`select t.params, t.truth from tasks t indexed by tasks_canary_brain
  where t.truth is not null and t.kind = 'connectome' and not exists (select 1 from order_tasks ot where ot.task = t.id)`)
  .iterate() as Iterable<{ params: string; truth: string }>;
for (const row of checked) {
  const truth = JSON.parse(row.truth) as TaskResult & { disputed?: unknown };
  if (truth.disputed || !truth.base) continue;
  const { key, params } = screenKey(JSON.parse(row.params) as TaskParams);
  const r = screenRates(params, truth, outputSizes, dt);
  const c = cells.get(key) ?? { params, seeds: 0, checked: 0, base: outputs.map(() => 0), stim: outputs.map(() => 0), spread: emptySpread(outputs.length) };
  c.seeds++;
  c.checked++;
  r.base.forEach((x, g) => { c.base[g] += x; });
  r.stim.forEach((x, g) => { c.stim[g] += x; });
  addSpread(c.spread, r);
  cells.set(key, c);
}
db.exec("commit");
db.close();

const round2 = (x: number) => Math.round(x * 100) / 100;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
parentPort!.postMessage({
  units: "spikes per neuron per second, mean over seeds",
  outputs,
  rows: [...cells.values()].map((c) => ({
    ...c.params, seeds: c.seeds, checked_seeds: c.checked,
    base_hz: c.base.map((x) => round2(x / c.seeds)), stim_hz: c.stim.map((x) => round2(x / c.seeds)),
    // over the seeds summed since schema 22 (spread_seeds of them)
    spread_seeds: c.spread.n,
    base_sd_hz: spreadSd(c.spread.n, c.spread.base, c.spread.base2)?.map(round3) ?? null,
    stim_sd_hz: spreadSd(c.spread.n, c.spread.stim, c.spread.stim2)?.map(round3) ?? null,
  })),
});
