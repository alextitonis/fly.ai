/**
 * Fly Colosseum fights on the network, end to end on a real server: a balance order (practice fights between random
 * fighters) and a season replay (listed fights with the server's own results kept back from miners), both played
 * by two agreeing miners on the real connectome, paid in points, and summarized at /api/experiments.
 *
 *   npm run test:fight      (~1 minute: about 30 real fights)
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fightResult, type FightParams } from "./fightjob.ts";
import { loadModel } from "./load.ts";
import { startPg } from "./pgtest.ts";

const PORT = 8789;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-fighttest-${process.pid}.db`);
const BLOBS = join(tmpdir(), `mine-fighttest-blobs-${process.pid}`);
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

let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5536);
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
  const model = loadModel(fileURLToPath(new URL("../../world/public/connectome/", import.meta.url)));

  check("a fight spec needs seeds or a list of fights", (await api("/api/admin/house", { label: "colosseum/bad", spec: { kind: "fight" } }, ADMIN)).status === 400);
  check("a listed fight needs four stats per fighter", (await api("/api/admin/house", { label: "colosseum/bad", spec: { kind: "fight", fights: [{ server_seed: "s", digest: "d", label: "0:0", a: { pow: 1 }, b: {} }] } }, ADMIN)).status === 400);
  const bal = (await api("/api/admin/house", { label: "colosseum/balance-test", spec: { kind: "fight", seeds: 12, seed_base: 500, max_stat: 30 } }, ADMIN)).json;
  check("a balance order: one practice fight per seed, 3.5 points each", bal?.status === "live" && bal.jobs === 12, JSON.stringify(bal?.error ?? bal?.jobs));

  // a "season" of two fights: the server's own results, one of them deliberately wrong, so the replay must catch it
  const listed: FightParams[] = [
    { server_seed: "f00d", digest: "beef", label: "0:0", a: { pow: 12, grd: 3, vit: 9, fury: 1 }, b: { pow: 4, grd: 10, vit: 5, fury: 7 } },
    { server_seed: "f00d", digest: "beef", label: "0:1", a: { pow: 8, grd: 8, vit: 2, fury: 2 }, b: { pow: 0, grd: 14, vit: 10, fury: 4 } },
  ];
  const truth = await Promise.all(listed.map((f) => fightResult(model, f)));
  const fights = listed.map((f, i) => ({ ...f, expect: {
    winner: i === 1 ? 1 - truth[i].winner : truth[i].winner, how: truth[i].how, rounds: truth[i].rounds, hp: truth[i].hp, seeds: truth[i].seeds,
  } }));
  const rep = (await api("/api/admin/house", { label: "colosseum/season-7-replay", spec: { kind: "fight", fights } }, ADMIN)).json;
  check("a season replay: one job per listed fight", rep?.status === "live" && rep.jobs === 2, JSON.stringify(rep?.error ?? rep?.jobs));

  const register = async () => (await api("/api/register", {})).json.token as string;
  const [ta, tb, old] = [await register(), await register(), await register()];
  const oldJobs = (await api("/api/claim", { count: 8, kinds: ["connectome", "world", "probe"], open_max: 8 }, old)).json?.jobs ?? [];
  check("miners that don't ask for fights never get one", oldJobs.every((j: any) => j.kind !== "fight"));

  const play = async (t: string) => {
    const seen: any[] = [];
    for (;;) {
      const jobs = ((await api("/api/claim", { count: 16, kinds: ["fight"], open_max: 16 }, t)).json?.jobs ?? []) as any[];
      if (!jobs.length) break;
      for (const j of jobs) {
        seen.push(j);
        const { kind: _k, index: _i, timeout_s: _t, max_output: _m, ...p } = j.params;
        const out = Buffer.from(JSON.stringify(await fightResult(model, p as FightParams))).toString("base64");
        await api("/api/submit", { job: j.job, result: { output: out } }, t);
      }
    }
    return seen;
  };
  const seenA = await play(ta);
  check("fight jobs carry the fight, never the server's answer", seenA.length === 14 && seenA.every((j) => j.kind === "fight" && j.params.a && j.params.b && j.params.label && !("expect" in j.params)),
    `${seenA.length} ${JSON.stringify(seenA[0]?.params)}`);
  check("practice fighters are drawn per seed, stats 0..30", seenA.filter((j) => j.params.digest === "balance").every((j) => Object.values(j.params.a).every((v: any) => v >= 0 && v <= 30)));
  await play(tb);

  const br = (await api(`/api/orders/${bal.id}/results`)).json;
  check("two agreeing miners settle every fight", br.status === "done" && br.rows.length === 12 && br.rows.every((r: any) => r.checked_by === "agreement"), JSON.stringify(br.rows?.map((r: any) => r.checked_by)));
  const me = (await api("/api/me", undefined, ta)).json;
  check("fights earn points", me.units > 0, JSON.stringify({ units: me.units, credited: me.credited }));

  // the first view after a restart starts the summaries and gets an empty list; ask until they're there
  let exp: any[] = [];
  for (let i = 0; i < 40 && exp.filter((e: any) => e.label.startsWith("colosseum/")).length < 2; i++) {
    exp = (await api("/api/experiments")).json?.experiments ?? [];
    await sleep(500);
  }
  const eb = exp.find((e: any) => e.label === "colosseum/balance-test");
  const er = exp.find((e: any) => e.label === "colosseum/season-7-replay");
  check("the balance summary: per-stat win chance from every fight", eb?.family === "colosseum" && eb.runs_read === 12 && eb.table?.length === 5 && eb.table[1][0] === "Power", JSON.stringify(eb));
  check("the replay summary catches a fight that came out differently", er?.family === "colosseum" && /1 of 2 replayed fights came out differently/.test(er.headline), er?.headline);
} catch (err) {
  console.log("test crashed:", err);
  failed++;
} finally {
  server?.kill();
  await sleep(300);
  for (const suffix of ["", "-wal", "-shm"]) try { rmSync(DB + suffix, { force: true }); } catch { /* busy */ }
  rmSync(BLOBS, { recursive: true, force: true });
  await PG.stop();
}
console.log(failed ? `${failed} FAILED` : "fight checks passed");
process.exit(failed ? 1 : 0);
