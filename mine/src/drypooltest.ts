/**
 * Claims while the open screen pool runs dry (2026-10-01 outage): claim() refills the pool inside its own
 * transaction, and topUp's transaction used to fail there with "cannot start a transaction within a transaction",
 * so every claim that found the pool empty was a 500 until the 15 s timer refilled it. Here a crowd of miners drains
 * one round (1,107 jobs) at once, and every claim must still come back with jobs.
 *
 *   npm run test:drypool     (SERVER=path/to/server.ts to try another copy)
 */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPg } from "./pgtest.ts";

const PORT = 8788;
const BASE = `http://localhost:${PORT}`;
const DB = join(tmpdir(), `mine-drypooltest-${process.pid}.db`);
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const api = async (path: string, body?: unknown, auth?: string, ip?: string) => {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(ip ? { "fly-client-ip": ip } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
};

let server: ReturnType<typeof spawn> | null = null;
let errors = "";
const PG = await startPg(5538);
try {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  const file = process.env.SERVER ? resolve(process.env.SERVER) : fileURLToPath(new URL("./server.ts", import.meta.url));
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", file], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "50", MAX_JOBS: "64", TRUST_PROXY: "1" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  server.stderr!.on("data", (d) => { errors += d; });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }

  // 24 miners x 64 jobs = 1,536 > one round: the pool runs dry part way, inside someone's claim
  const tokens: string[] = [];
  for (let i = 0; i < 24; i++) tokens.push((await api("/api/register", { label: `dry${i}` }, undefined, `10.0.0.${i}`)).json.token); // 5 per address
  const results = await Promise.all(tokens.flatMap((t) => [api("/api/claim", { count: 32 }, t), api("/api/claim", { count: 32 }, t)]));
  const bad = results.filter((r) => r.status !== 200);
  const got = results.reduce((n, r) => n + (r.json?.jobs?.length ?? 0), 0);
  check("every claim answers while the pool runs dry", bad.length === 0, bad.length ? `${bad.length} failed: ${bad[0].text.slice(0, 120)}` : `${results.length} claims`);
  check("and every miner gets its full load", got === 24 * 64, `${got} of ${24 * 64} jobs`);
  check("no nested-transaction errors in the log", !/within a transaction/.test(errors));
  const again = await api("/api/claim", { count: 1 }, tokens[0]);
  check("the server still answers afterwards", again.status === 429, again.text.slice(0, 80));
} catch (err) {
  console.error(err);
  failed++;
} finally {
  server?.kill();
  await sleep(300);
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
}
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
