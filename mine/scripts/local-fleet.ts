/**
 * A practice fleet on your own machine: a local compute server (with its own throwaway Postgres) and a few simulated
 * miners running the real job code, so you can try an evolve or train run (or any program order) end to end before
 * paying for one. Orders are house orders made with the printed admin token: nothing is paid, nothing leaves the PC.
 *
 *   node scripts/local-fleet.ts [--miners 2] [--port 8790]
 *
 * Then, from Python:   FLYAI_SERVER=http://localhost:8790 FLYAI_ADMIN_TOKEN=local python your_run.py
 * or the skill:        FLYAI_SERVER=http://localhost:8790 node skills/flyai-compute/scripts/flyai.mjs ...
 *
 * The miners take es, esb (loads the 57 MB connectome on first use), sgd, wasm and world jobs. Text completion needs a
 * browser GPU (WebLLM), so "complete" jobs are answered with a stand-in text here: fine for checking the plumbing,
 * not the words. Ctrl+C stops everything and deletes the data.
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startPg } from "../src/pgtest.ts";

const arg = (name: string, d: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const PORT = Number(arg("port", "8790"));
const MINERS = Number(arg("miners", "2"));
const BASE = `http://localhost:${PORT}`;
const ADMIN = "local";
const DB = join(tmpdir(), `mine-localfleet-${process.pid}.db`);
const BLOBS = join(tmpdir(), `mine-localfleet-blobs-${process.pid}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

const PG = await startPg(PORT + 1000);
const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("../src/server.ts", import.meta.url))], {
  env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, BLOBS_DIR: BLOBS, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0",
    OPEN_TARGET: "20", ADMIN_TOKEN: ADMIN, MIN_CHECKED: "1", HOUSEKEEPING_MS: "2000" },
  stdio: ["ignore", "ignore", "inherit"],
});
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  server.kill();
  await PG.stop().catch(() => {});
  for (const s of ["", "-wal", "-shm"]) rmSync(DB + s, { force: true });
  rmSync(BLOBS, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

for (let i = 0; ; i++) {
  try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
  if (i > 120) throw new Error("the server didn't start");
  await sleep(500);
}
const api = async (path: string, body?: unknown, auth?: string) => {
  const res = await fetch(BASE + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok || !text) return null; // a claim with nothing to hand out has no body
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// the job code itself, as a miner page runs it
const { runEs, runSgd, runBrainEs } = await import("../web/trainjob.ts");
const { runWasm } = await import("../web/openjob.ts");
const { runWorld } = await import("../web/worldjob.ts");
let brain: { probe: (p: unknown) => Uint8Array; columnsOf: (t: string[], s?: "L" | "R") => number[] } | null = null;
async function loadBrain() {
  if (brain) return brain;
  const { loadModel } = await import("../src/load.ts");
  const { fixedFrom } = await import("../src/fixed.ts");
  const { recordSets, runProbe } = await import("../src/probe.ts");
  const { cells } = await import("../../world/src/connectome.ts");
  const model = loadModel(fileURLToPath(new URL("../../world/public/connectome/", import.meta.url)));
  const fx = fixedFrom(model.w.lut, model.meta.params);
  const order = recordSets(model, ["descending", "wing"]).flatMap((set) => Array.from(set));
  brain = {
    probe: (p) => runProbe(model, fx, p as never),
    columnsOf: (types, side) => {
      const want = new Set(cells(model.meta, types, side));
      return order.flatMap((n, k) => (want.has(n) ? [k] : []));
    },
  };
  return brain;
}
async function answer(j: any): Promise<unknown> {
  try {
    const p = j.params;
    if (j.kind === "es") return { output: b64(await runEs(BASE, p.input)) };
    if (j.kind === "sgd") return { output: b64(await runSgd(BASE, p.input)) };
    if (j.kind === "esb") {
      const b = await loadBrain();
      return { output: b64(await runBrainEs(BASE, p.input, b.probe as never, b.columnsOf)) };
    }
    if (j.kind === "world") return { output: b64(runWorld(p)) };
    if (j.kind === "complete") {
      const prompts = JSON.parse(Buffer.from(await (await fetch(BASE + p.input_url)).arrayBuffer()).toString("utf8")) as unknown[];
      return { output: b64(new TextEncoder().encode(JSON.stringify({ texts: prompts.map((_, i) => `(local fleet stand-in text ${i})`) }))) };
    }
    if (j.kind === "wasm") {
      const program = new Uint8Array(await (await fetch(BASE + p.program_url)).arrayBuffer());
      const input = p.input_url ? new Uint8Array(await (await fetch(BASE + p.input_url)).arrayBuffer()) : new Uint8Array(new Uint32Array([p.index]).buffer);
      const seed = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${p.program}:${p.input ?? `#${p.index}`}`)));
      return { output: b64((await runWasm(program, input, seed, p.max_output)).output) };
    }
    return { error: `the local fleet doesn't run ${j.kind}` };
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err).slice(0, 200) };
  }
}

const tokens: string[] = [];
for (let i = 0; i < MINERS; i++) tokens.push((await api("/api/register", { label: `local-${i + 1}` })).token);
console.log(`local fleet: ${BASE}  (admin token "${ADMIN}", ${MINERS} miners)`);
console.log(`  python:  FLYAI_SERVER=${BASE} FLYAI_ADMIN_TOKEN=${ADMIN} python your_run.py`);
console.log("  Ctrl+C to stop; everything is deleted on exit");
let done = 0;
for (;;) {
  let worked = false;
  try {
    for (const t of tokens) {
      const jobs = (await api("/api/claim", { count: 4, kinds: ["es", "esb", "sgd", "wasm", "world", "complete"], open_max: 4 }, t))?.jobs ?? [];
      for (const j of jobs) {
        worked = true;
        await api("/api/submit", { job: j.job, result: await answer(j) }, t);
        if (++done % 50 === 0) console.log(`  ${done} jobs answered`);
      }
    }
  } catch (err) {
    console.error(`  miner: ${err instanceof Error ? err.message : err}`);
  }
  if (!worked) await sleep(300);
}
