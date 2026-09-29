/**
 * Giving jobs back: a page that reloads mid-batch leaves its claims on the server, and they used to fill the miner's
 * MAX_JOBS ("already running 64 jobs") until JOB_TTL. /api/release frees all of them, or just the listed ones.
 *
 *   npm run test:release
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startPg } from "./pgtest.ts";

const PORT = 8787;
const BASE = `http://localhost:${PORT}`;
const DB = join(tmpdir(), `mine-releasetest-${process.pid}.db`);
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
const PG = await startPg(5537);
try {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "300", MAX_JOBS: "64" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }

  const { token } = (await api("/api/register", { label: "release" })).json;
  const other = (await api("/api/register", { label: "other" })).json.token;
  const a = await api("/api/claim", { count: 32 }, token);
  const b = await api("/api/claim", { count: 32 }, token);
  check("a reloaded page's two batches fill the cap", a.json?.jobs.length === 32 && b.json?.jobs.length === 32);
  const full = await api("/api/claim", { count: 32 }, token);
  check("then claims are refused", full.status === 429, full.json?.error);

  const one = await api("/api/release", { jobs: [a.json.jobs[0].job] }, token);
  check("releasing one job frees one slot", one.json?.released === 1 && (await api("/api/claim", { count: 32 }, token)).json?.jobs.length === 1);
  check("another miner can't release my jobs", (await api("/api/release", { jobs: [a.json.jobs[1].job] }, other)).json?.released === 0);
  check("bad job lists are refused", (await api("/api/release", { jobs: "x" }, token)).status === 400);
  check("releasing needs a miner", (await api("/api/release", {})).status === 401);

  const all = await api("/api/release", {}, token);
  check("releasing everything frees the whole load", all.json?.released === 64, JSON.stringify(all.json));
  const again = await api("/api/claim", { count: 32 }, token);
  check("and full batches come again", again.json?.jobs.length === 32);
  const late = await api("/api/submit", { job: b.json.jobs[0].job, result: {} }, token);
  check("a released job can't be submitted", late.status === 409, late.json?.error);

  // a whole batch's answers in one request (web/mine-core.ts submitMany)
  const groups = (await api("/api/model")).json?.outputs?.length ?? 0;
  check("the model lists its motor groups", groups > 0, String(groups));
  const zeros = Array.from({ length: groups }, () => 0);
  const answer = { hash: "0000000000000000", spikes: 1, base: zeros, stim: zeros };
  const batch = await api("/api/submit", { results: again.json.jobs.map((j: any) => ({ job: j.job, result: answer })) }, token);
  check("a batch of answers goes in one request", batch.status === 200 && batch.json?.results?.length === 32
    && batch.json.results.every((r: any) => r.status === "received"),
    `${batch.json?.results?.filter((r: any) => r.status !== "received").length} of 32 not received: ${JSON.stringify(batch.json?.results?.find((r: any) => r.status !== "received"))}`);
  const mixed = await api("/api/submit", { results: [{ job: again.json.jobs[0].job, result: answer }, { job: "nope", result: answer }] }, token);
  check("a bad job in a batch fails on its own", mixed.status === 200 && mixed.json.results[0].status === "error"
    && mixed.json.results[1].code === 404, JSON.stringify(mixed.json).slice(0, 160));
  check("an oversized batch is refused", (await api("/api/submit", { results: Array.from({ length: 65 }, () => ({ job: "x", result: answer })) }, token)).status === 400);
} catch (err) {
  console.error(err);
  failed++;
} finally {
  server?.kill();
  await sleep(300);
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
