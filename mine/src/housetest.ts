/**
 * House orders end to end on a real server (no chain needed): world runs and brain probes created with the admin
 * token, handed out after paid work and before the screen, settled by two agreeing miners who earn points, results
 * kept for good, listed at /api/house, and pulled into local files by scripts/pull-house.ts.
 *
 *   npm run test:house
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { fixedFrom } from "./fixed.ts";
import { loadModel } from "./load.ts";
import { startPg } from "./pgtest.ts";
import { recordSets, runProbe, type ProbeParams } from "./probe.ts";
import { runWorld, type WorldParams } from "../web/worldjob.ts";

const PORT = 8786;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-housetest-${process.pid}.db`);
const BLOBS = join(tmpdir(), `mine-housetest-blobs-${process.pid}`);
const OUT = join(tmpdir(), `mine-housetest-out-${process.pid}`);
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
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json };
};
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5533);
try {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, BLOBS_DIR: BLOBS, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "20", ADMIN_TOKEN: ADMIN, MIN_CHECKED: "1" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }

  const world = { kind: "world", seeds: 2, seed_base: 100, flies: 6, seconds: 8, sample_s: 4 };
  check("house orders need the admin token", (await api("/api/admin/house", { label: "world/test", spec: world })).status === 403);
  check("buyers can't order house kinds", (await api("/api/orders/quote", { spec: world })).status === 400);
  check("a bad probe sense is refused", (await api("/api/admin/house", { label: "probe/bad", spec: { kind: "probe", seeds: 1, conditions: [{ name: "x", stimuli: [{ sense: "smell-of-money" }] }] } }, ADMIN)).status === 400);
  const w = (await api("/api/admin/house", { label: "world/test", spec: world }, ADMIN)).json;
  check("a world house order starts at once, unpaid", w?.status === "live" && w.house === true && w.jobs === 2 && w.spent === "0", JSON.stringify({ s: w?.status, j: w?.jobs }));

  const probe = {
    kind: "probe", seeds: 1, seed_base: 7, steps: 40, bin_steps: 10, record: ["descending", "wing"],
    conditions: [{ name: "nothing", stimuli: [] }, { name: "threat", stimuli: [{ sense: "threat", amount: 0.8, from: 10, to: 40 }] }],
  };
  const pr = (await api("/api/admin/house", { label: "encoding/words", spec: probe, max_parallel: 4 }, ADMIN)).json;
  check("a probe house order: one job per condition per seed", pr?.status === "live" && pr.jobs === 2, JSON.stringify(pr?.error ?? pr?.jobs));
  const sweep = (await api("/api/admin/house", { label: "tuning/threat", spec: { kind: "connectome-sweep", channels: ["LC4"], sides: ["L"], amounts: [0.4], gains: [3], tonics: [0.14], seeds: [990001], warm: 250 } }, ADMIN)).json;
  check("a brain tuning sweep as a house order", sweep?.status === "live" && sweep.jobs === 1);

  const register = async () => (await api("/api/register", {})).json.token as string;
  const [ta, tb, old] = [await register(), await register(), await register()];
  const oldJobs = (await api("/api/claim", { count: 8 }, old)).json.jobs;
  check("house brain jobs go ahead of the screen, even to old clients", oldJobs.some((j: any) => j.params.seed === 990001) && oldJobs.every((j: any) => j.kind === "connectome"));

  const model = loadModel(fileURLToPath(new URL("../../world/public/connectome/", import.meta.url)));
  const fx = fixedFrom(model.w.lut, model.meta.params);
  const answer = (j: any) => {
    const { kind: _k, index: _i, timeout_s: _t, max_output: _m, condition: _c, ...p } = j.params;
    return { output: b64(j.kind === "world" ? runWorld(p as WorldParams) : runProbe(model, fx, p as ProbeParams)) };
  };
  const claim = async (t: string) => ((await api("/api/claim", { count: 8, kinds: ["world", "probe"], open_max: 8 }, t)).json?.jobs ?? []) as any[];
  const a = await claim(ta);
  check("miners get world and probe jobs with their settings, no downloads", a.length === 4 && a.some((j) => j.kind === "world" && j.params.seed === 100 && j.params.flies === 6)
    && a.some((j) => j.kind === "probe" && j.params.condition === "threat" && j.params.seed === 7) && a.every((j) => !j.params.program_url), `${a.length}`);
  for (const j of a) await api("/api/submit", { job: j.job, result: answer(j) }, ta);
  const b = await claim(tb);
  for (const j of b) await api("/api/submit", { job: j.job, result: answer(j) }, tb);

  const wr = (await api(`/api/orders/${w.id}/results`)).json;
  const pres = (await api(`/api/orders/${pr.id}/results`)).json;
  check("two agreeing miners settle world runs", wr.status === "done" && wr.rows.length === 2 && wr.rows.every((r: any) => r.checked_by === "agreement"), JSON.stringify(wr.rows.map((r: any) => r.checked_by)));
  check("and probes", pres.status === "done" && pres.rows.length === 2);
  const worldOut = JSON.parse(Buffer.from(await (await fetch(BASE + wr.rows[0].output.url)).arrayBuffer()).toString("utf8"));
  check("a world result is the run's summary", typeof worldOut.totals?.landings === "number" && worldOut.samples.length === 2 && worldOut.flies === 6, JSON.stringify(worldOut.end));
  const [dn, wing] = recordSets(model, ["descending", "wing"]);
  const threatRow = pres.rows.find((r: any) => r.index === 1);
  check("a probe result is bins x neurons of u16 counts", threatRow?.output.size === 4 * (dn.length + wing.length) * 2, String(threatRow?.output.size));

  const me = (await api("/api/me", undefined, ta)).json;
  check("house jobs earn points: world 6 x 8 s x 0.00225 each, probes steps / 100", me.units > 0 && me.credited > 0, JSON.stringify({ units: me.units, credited: me.credited, standing: me.standing }));
  const db = new DatabaseSync(DB);
  const kept = (db.prepare("select count(*) as n from blobs where keep = 1").get() as { n: number }).n;
  // anything booked is in Postgres, or still queued for it
  const queued = (db.prepare("select count(*) as n from pg_outbox").get() as { n: number }).n;
  db.close();
  const earned = (await PG.pg.one<{ n: number }>("select count(*) as n from mine.earnings"))!.n + queued;
  const charged = (await PG.pg.one<{ n: number }>("select count(*) as n from mine.ledger"))!.n;
  check("house outputs are kept for good; nothing is charged or paid out", kept >= 4 && earned === 0 && charged === 0, JSON.stringify({ kept, earned, charged }));
  const house = (await api("/api/house")).json.orders;
  check("/api/house lists our work", house.length === 3 && house.some((o: any) => o.label === "encoding/words" && o.settled === 2));
  const exp = (await api("/api/experiments")).json?.experiments ?? [];
  const ew = exp.find((e: any) => e.label === "world/test");
  const ep = exp.find((e: any) => e.label === "encoding/words");
  check("/api/experiments summarizes each house order from its results", ew?.family === "world" && ew.runs_read === 2 && ew.settled === 2 && /colonies/.test(ew.headline)
    && ep?.family === "encoding" && ep.runs_read === 2 && ep.table?.[1]?.[0] === "threat" && exp.some((e: any) => e.label === "tuning/threat"), JSON.stringify(exp.map((e: any) => [e.label, e.headline])));
  check("house orders can be stopped", (await api(`/api/admin/house/${sweep.id}/stop`, {}, ADMIN)).json?.status === "ended");

  execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("../scripts/pull-house.ts", import.meta.url)), "--server", BASE, "--out", OUT], { stdio: "ignore" });
  const probeDir = join(OUT, "encoding/words", pr.id);
  const layout = JSON.parse(readFileSync(join(probeDir, "outputs", "layout.json"), "utf8"));
  check("pull-house writes rows, outputs and the probe layout", readFileSync(join(probeDir, "results.jsonl"), "utf8").trim().split("\n").length === 2
    && readdirSync(join(probeDir, "outputs")).filter((f) => f.endsWith(".u16")).length === 2 && layout.sets[0].neurons.length === dn.length
    && existsSync(join(OUT, "world/test", w.id, "outputs")) && readdirSync(join(OUT, "world/test", w.id, "outputs")).length === 2);
  execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("../scripts/pull-house.ts", import.meta.url)), "--server", BASE, "--out", OUT], { stdio: "ignore" });
  check("pulling again adds nothing twice", readFileSync(join(probeDir, "results.jsonl"), "utf8").trim().split("\n").length === 2);
} catch (err) {
  console.log("test crashed:", err);
  failed++;
} finally {
  server?.kill();
  await sleep(300);
  try {
    const drift = creditDrift(DB);
    check("day_credit matches the assignments", !drift.length, drift.slice(0, 3).join(", "));
  } catch (err) {
    check("day_credit matches the assignments", false, String(err));
  }
  for (const suffix of ["", "-wal", "-shm"]) try { rmSync(DB + suffix, { force: true }); } catch { /* busy */ }
  rmSync(BLOBS, { recursive: true, force: true });
  rmSync(OUT, { recursive: true, force: true });
  await PG.stop();
}
console.log(failed ? `${failed} FAILED` : "house checks passed");
process.exit(failed ? 1 : 0);

/** day_credit (kept by triggers) must equal a full count over the assignments. */
function creditDrift(path: string): string[] {
  const db = new DatabaseSync(path);
  const bad = db.prepare(`select coalesce(x.day, d.day) as day, coalesce(x.miner, d.miner) as miner from (
      select a.day, a.miner, coalesce(sum(case when a.status in ('accepted', 'pending') and t.kind = 'connectome' then t.units end), 0) as units,
        coalesce(sum(case when a.status in ('accepted', 'pending') and t.kind != 'connectome' then t.units end), 0) as program_units,
        coalesce(sum(a.status = 'accepted'), 0) as accepted, coalesce(sum(a.status = 'pending'), 0) as pending, coalesce(sum(a.status = 'rejected'), 0) as rejected
      from assignments a join tasks t on t.id = a.task where a.day is not null group by a.day, a.miner) x
    full outer join day_credit d on d.day = x.day and d.miner = x.miner
    where abs(coalesce(x.units, 0) - coalesce(d.units, 0)) > 1e-6 or abs(coalesce(x.program_units, 0) - coalesce(d.program_units, 0)) > 1e-6
      or coalesce(x.accepted, 0) != coalesce(d.accepted, 0) or coalesce(x.pending, 0) != coalesce(d.pending, 0) or coalesce(x.rejected, 0) != coalesce(d.rejected, 0)`)
    .all() as { day: string; miner: string }[];
  const rows = (db.prepare("select count(*) as n from day_credit").get() as { n: number }).n;
  db.close();
  return bad.length ? bad.map((b) => `${b.day} ${b.miner}`) : rows ? [] : ["day_credit is empty"];
}
