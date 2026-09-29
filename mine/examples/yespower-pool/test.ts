/**
 * The yespower miner and its pool bridge, checked:
 *   1. the WebAssembly hasher reproduces the reference implementation's published vectors
 *   2. it finds exactly the hits a full scan of the range finds, and reports honest hashes
 *   3. the bridge in --local mode gets shares accepted by a mock pool that judges them with yespower
 *   4. the whole path: a house order, the bridge adding jobs, a miner claiming and running them, results back,
 *      shares accepted at the pool
 *
 *   node examples/yespower-pool/test.ts    (from mine/)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startPg } from "../../src/pgtest.ts";
import { runWasm } from "../../web/openjob.ts";
import { headerPrefix, meets, shareTarget } from "../btc-pool/stratum.ts";
import { GENESIS_EXTRANONCE1, GENESIS_JOB } from "../btc-pool/vectors.ts";
import { startMockPool } from "./mock-pool.ts";
import { COINS, display, hits, input, PROGRAM, yespowerHash } from "./hash.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PORT = 8795;
const POOL_PORT = 3335;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "yespower-test-admin";
const DB = join(tmpdir(), `mine-yespowertest-${process.pid}.db`);
const BLOBS = join(tmpdir(), `mine-yespowertest-blobs-${process.pid}`);
const BRIDGE = fileURLToPath(new URL("./bridge.ts", import.meta.url));
const procs: ChildProcess[] = [];
const run = (args: string[], env: Record<string, string> = {}) => {
  const p = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "inherit"] });
  procs.push(p);
  return p;
};
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

const PG = await startPg(5539);
try {
  // ---- 1. the hasher against the reference's own vectors ---------------------------------------------------------
  {
    // the reference's test input is src[i] = i * 3; its last four bytes are the nonce in our job format
    const src = Buffer.from(Array.from({ length: 80 }, (_, i) => (i * 3) & 0xff));
    const v10 = await yespowerHash(src, { version: 1, N: 2048, r: 8, pers: "" });
    check("yespower 1.0 (N=2048, r=8) matches the reference vector",
      v10.toString("hex") === "69e0e895b3df7aeeb837d71fe199e9d34f7ec46ecbca7a2c4308e51857ae9b46", v10.toString("hex").slice(0, 24));
    const v05 = await yespowerHash(src, { version: 0, N: 2048, r: 8, pers: "Client Key" });
    check("yespower 0.5 with a personalization string matches too",
      v05.toString("hex") === "a59fec4c4fdda16e3b1405adda66d525b68e7cadfcfe6ac066c7ad118cd80590", v05.toString("hex").slice(0, 24));
  }

  // ---- 2. the search finds exactly the hits a full scan finds ----------------------------------------------------
  {
    const params = COINS.yescrypt;
    const prefix = headerPrefix(GENESIS_JOB, GENESIS_EXTRANONCE1, "00000000");
    // a target of about 1 in 8 nonces: too loose to express as a pool difficulty, so it is built by hand
    const target = Buffer.alloc(32, 0xff);
    target[0] = 0x1f;
    const job = input(prefix, 0, 64, target, params, prefix);
    const { output } = await runWasm(new Uint8Array(PROGRAM), new Uint8Array(job), new Uint8Array(32), 1 << 16);
    const found = hits(output);
    const want: number[] = [];
    for (let nonce = 0; nonce < 64; nonce++) {
      const header = Buffer.alloc(80);
      prefix.copy(header, 0, 0, 76);
      header.writeUInt32LE(nonce, 76);
      if (meets(display(await yespowerHash(header, params)), target)) want.push(nonce);
    }
    check("the program finds exactly the qualifying nonces", JSON.stringify(found.map((h) => h.nonce)) === JSON.stringify(want),
      `${found.length} found, ${want.length} expected`);
    let honest = true;
    for (const hit of found) {
      const header = Buffer.alloc(80);
      prefix.copy(header, 0, 0, 76);
      header.writeUInt32LE(hit.nonce, 76);
      if (!(await yespowerHash(header, params)).equals(hit.hash)) honest = false;
    }
    check("and reports each hit's real hash", honest && found.length > 0, `${found.length} hits`);
  }

  // ---- 3. the bridge on its own, against a mock pool --------------------------------------------------------------
  const pool = await startMockPool(POOL_PORT, 0.0000002, COINS.yescrypt);
  {
    const bridge = run([BRIDGE, "--pool", `stratum+tcp://127.0.0.1:${POOL_PORT}`, "--user", "test.worker", "--local",
      "--coin", "yescrypt", "--per-job", "400", "--shares", "1"]);
    let out = "";
    bridge.stdout?.on("data", (d) => { out += d.toString(); });
    const until = Date.now() + 120_000;
    while (Date.now() < until && pool.shares.accepted < 1) await sleep(500);
    check("the bridge mines locally and the pool accepts a share", pool.shares.accepted >= 1,
      `${pool.shares.accepted} accepted, ${pool.shares.rejected} rejected${pool.shares.accepted ? "" : `; ${out.slice(-200)}`}`);
    bridge.kill();
  }

  // ---- 4. the whole path: house order, a miner, results, shares ---------------------------------------------------
  {
    for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
    const server = run([fileURLToPath(new URL("../../src/server.ts", import.meta.url))], {
      PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, BLOBS_DIR: BLOBS, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0",
      AUDITS: "0", OPEN_TARGET: "20", ADMIN_TOKEN: ADMIN, MIN_CHECKED: "1",
    });
    server.stdout?.resume();
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
      if (i > 120) throw new Error("server didn't start");
      await sleep(500);
    }
    const before = pool.shares.accepted;
    const bridge = run([BRIDGE, "--pool", `stratum+tcp://127.0.0.1:${POOL_PORT}`, "--user", "test.worker",
      "--coin", "yescrypt", "--per-job", "400", "--ahead", "4", "--server", BASE, "--admin", ADMIN, "--shares", "1"]);
    bridge.stdout?.resume();

    // a miner: claim the bridge's jobs, run them, submit
    const token = (await api("/api/register", { label: "yespower" })).json.token as string;
    const until = Date.now() + 180_000;
    let ran = 0;
    while (Date.now() < until && pool.shares.accepted < before + 1) {
      const claim = (await api("/api/claim", { count: 2, kinds: ["wasm"], open_max: 2 }, token)).json;
      for (const job of claim?.jobs ?? []) {
        const program = new Uint8Array(await (await fetch(BASE + job.params.program_url)).arrayBuffer());
        const inputBytes = new Uint8Array(await (await fetch(BASE + job.params.input_url)).arrayBuffer());
        const { output } = await runWasm(program, inputBytes, new Uint8Array(32), job.params.max_output);
        await api("/api/submit", { job: job.job, result: { output: Buffer.from(output).toString("base64") } }, token);
        ran++;
      }
      if (!claim?.jobs?.length) await sleep(500);
    }
    check("the house order runs on a miner and its share reaches the pool", pool.shares.accepted >= before + 1,
      `${ran} jobs run, ${pool.shares.accepted - before} shares`);
    let listed: any = null;
    for (let i = 0; i < 20 && !listed; i++) {
      listed = (await api("/api/house")).json.orders.find((o: any) => o.label === "mining/yescrypt");
      if (!listed) await sleep(1000); // the house listing is cached for ten seconds
    }
    const detail = listed ? (await api(`/api/orders/${listed.id}`)).json : null;
    check("the mining order is one of ours, unpaid and still open",
      !!detail && detail.house === true && detail.spent === "0" && detail.status === "live" && detail.kind === "wasm",
      JSON.stringify(detail && { status: detail.status, house: detail.house, spent: detail.spent, jobs: detail.jobs, settled: detail.settled }));
    const me = (await api("/api/me", undefined, token)).json;
    check("the miner earns points for mining jobs", me.units > 0, JSON.stringify({ units: me.units, jobs: me.jobs }));
    bridge.kill();
  }
  pool.server.close();
} catch (err) {
  console.log("test crashed:", err);
  failed++;
} finally {
  for (const p of procs) p.kill();
  await sleep(300);
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) try { rmSync(DB + suffix, { force: true }); } catch { /* busy */ }
  rmSync(BLOBS, { recursive: true, force: true });
}
console.log(failed ? `${failed} FAILED` : "yespower mining checks passed");
process.exit(failed ? 1 : 0);
