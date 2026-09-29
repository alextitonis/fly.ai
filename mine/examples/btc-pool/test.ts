/**
 * The pool bridge, checked:
 *   1. Stratum byte orders against real blocks: the genesis block built from Stratum parts, and block 1's hash
 *   2. hash_search.wasm finds exactly the hits a plain JavaScript search finds
 *   3. the bridge in --local mode gets shares accepted by the mock pool
 *   4. the whole path on a local chain: a paid keep-open order, the bridge adding jobs, a miner claiming and running
 *      them, results back, shares accepted at the pool
 *   5. the guided setup (start.ts) answered like a person, then paid and mining
 *
 *   node examples/btc-pool/test.ts   (from mine/; needs Foundry's anvil and forge for part 4)
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startPg } from "../../src/pgtest.ts";
import { runWasm } from "../../web/openjob.ts";
import { blockTarget, extranonce2Bytes, headerHash, headerPrefix, meets, prevhashBytes, sha256d, shareTarget, type PoolJob } from "./stratum.ts";
import { startMockPool } from "./mock-pool.ts";
import * as V from "./vectors.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MINE = fileURLToPath(new URL("../../", import.meta.url));
const BRIDGE = fileURLToPath(new URL("./bridge.ts", import.meta.url));
const PROGRAM = readFileSync(new URL("../hash-search/hash_search.wasm", import.meta.url));
const procs: ChildProcess[] = [];
const cleanup: string[] = [];

// ---- 1. byte orders --------------------------------------------------------------------------------------------
{
  check("genesis coinbase hashes to its merkle root", sha256d(Buffer.from(V.GENESIS_COINBASE, "hex")).equals(Buffer.from(V.GENESIS_HEADER.slice(72, 136), "hex")));
  const prefix = headerPrefix(V.GENESIS_JOB, V.GENESIS_EXTRANONCE1, V.GENESIS_EXTRANONCE2);
  check("the genesis header, rebuilt from Stratum parts, is byte for byte the real one", prefix.toString("hex") === V.GENESIS_HEADER.slice(0, 152));
  check("with its nonce it hashes to the genesis hash, under its own target", headerHash(prefix, V.GENESIS_NONCE).toString("hex") === V.GENESIS_HASH && meets(headerHash(prefix, V.GENESIS_NONCE), blockTarget("1d00ffff")));
  check("a live pool's prevhash, swapped back, is the chain tip it was mining on", Buffer.from(prevhashBytes(V.LIVE_PREVHASH.stratum)).reverse().toString("hex") === V.LIVE_PREVHASH.tip);
  // block 1 as a pool would send it: the genesis hash with each word byte-swapped
  const genesisInternal = Buffer.from(V.GENESIS_HASH, "hex").reverse();
  const stratumPrev = Buffer.alloc(32);
  for (let i = 0; i < 32; i += 4) genesisInternal.subarray(i, i + 4).reverse().forEach((b, k) => { stratumPrev[i + k] = b; });
  const block1: PoolJob = { id: "1", prevhash: stratumPrev.toString("hex"), coinb1: "", coinb2: "", branch: [], version: "00000001", nbits: "1d00ffff", ntime: V.BLOCK1.ntime.toString(16) };
  const p1 = Buffer.concat([headerPrefix(block1, "", "").subarray(0, 36), Buffer.from(V.BLOCK1.merkleDisplay, "hex").reverse(), headerPrefix(block1, "", "").subarray(68)]);
  check("block 1: prevhash, time and bits in Stratum's byte order give its real hash", headerHash(p1, V.BLOCK1.nonce).toString("hex") === V.BLOCK1.hash);
  check("difficulty 1 is Bitcoin's difficulty-1 target; difficulty 2 halves it", shareTarget(1).toString("hex") === "00000000ffff" + "0".repeat(52)
    && BigInt(`0x${shareTarget(2).toString("hex")}`) === BigInt(`0x${shareTarget(1).toString("hex")}`) / 2n);
  check("the extranonce2 size is read off the coinbase: 8 bytes", extranonce2Bytes(V.GENESIS_JOB, V.GENESIS_EXTRANONCE1) === 8);
  const cut = V.GENESIS_JOB.coinb1.length;
  const four = { ...V.GENESIS_JOB, coinb2: V.GENESIS_COINBASE.slice(cut + 16) };
  check("…and 4 bytes when the pool splits it that way", extranonce2Bytes(four, V.GENESIS_EXTRANONCE1) === 4);
}

// ---- 2. the program against plain JavaScript ----------------------------------------------------------------------
{
  const prefix = headerPrefix(V.GENESIS_JOB, V.GENESIS_EXTRANONCE1, "0000000000000007");
  const target = shareTarget(0.0001); // a share takes difficulty x 2^32 hashes on average: one hit per ~430 thousand nonces, ~14 expected in 6 million
  const input = Buffer.alloc(116);
  prefix.copy(input);
  input.writeUInt32LE(5_000_000, 76);
  input.writeUInt32LE(6_000_000, 80);
  target.copy(input, 84);
  const out = Buffer.from((await runWasm(PROGRAM, input, new Uint8Array(32), 1 << 16)).output);
  const wasmHits = Array.from({ length: out.readUInt32LE(0) }, (_, i) => out.readUInt32LE(4 + i * 36));
  const jsHits: number[] = [];
  for (let n = 5_000_000; n < 11_000_000 && jsHits.length < 64; n++) if (meets(headerHash(prefix, n), target)) jsHits.push(n);
  check("hash_search.wasm finds exactly the nonces a plain search finds", wasmHits.length >= 1 && wasmHits.join() === jsHits.join(), `${wasmHits.length} hits, plain search ${jsHits.length}`);
}

const PG = await startPg(5538);
try {
  // ---- 3. --local against the mock pool ---------------------------------------------------------------------------
  const run = (argv: string[], timeoutMs: number) => new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", BRIDGE, ...argv], { cwd: MINE });
    procs.push(child);
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("exit", (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
  const local = await startMockPool(3391, 0.0005);
  const r3 = await run(["--pool", "stratum+tcp://127.0.0.1:3391", "--user", "test", "--local", "--per-job", "2000000", "--shares", "3"], 120_000);
  check("--local: the pool accepts the bridge's shares", r3.code === 0 && local.shares.accepted >= 3 && local.shares.rejected === 0, `${local.shares.accepted} accepted, ${local.shares.rejected} rejected`);
  local.server.close();

  // ---- 4. through fly.ai compute on a local chain ------------------------------------------------------------------
  const RPC = "http://127.0.0.1:8549";
  const PORT = 8793;
  const BASE = `http://localhost:${PORT}`;
  const DB = join(tmpdir(), `btcpool-test-${process.pid}.db`);
  const anvil = spawn("anvil", ["--port", "8549"], { stdio: ["ignore", "pipe", "ignore"] });
  procs.push(anvil);
  const keys: string[] = await new Promise((resolve) => {
    let buf = "";
    anvil.stdout!.on("data", (d) => { buf += d; const ks = [...buf.matchAll(/\(\d\) (0x[0-9a-f]{64})/g)].map((m) => m[1]); if (ks.length >= 2 && buf.includes("Listening")) resolve(ks); });
  });
  const rpc = async (method: string, params: unknown[]) => {
    const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
    if (r.error) throw new Error(r.error.message);
    return r.result;
  };
  const [owner, buyer] = await rpc("eth_accounts", []);
  const created = execFileSync("forge", ["create", "test/MonthlyClaims.t.sol:TestToken", "--rpc-url", RPC, "--private-key", keys[0], "--broadcast"], { cwd: join(MINE, "contracts"), encoding: "utf8" });
  const token = /Deployed to: (0x[0-9a-fA-F]{40})/.exec(created)![1];
  const word = (v: bigint | string) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
  const mined = async (hash: string) => { for (let i = 0; i < 50; i++) { if (await rpc("eth_getTransactionReceipt", [hash])) return hash; await sleep(100); } throw new Error("no receipt"); };
  await mined(await rpc("eth_sendTransaction", [{ from: owner, to: token, data: `0x40c10f19${word(buyer)}${word(100_000n * 10n ** 18n)}` }]));

  for (const s of ["", "-wal", "-shm"]) rmSync(DB + s, { force: true });
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", join(MINE, "src/server.ts")], {
    env: { ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, BLOBS_DIR: `${DB}-blobs`, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "20",
      TOKEN_ADDRESS: token, CLAIM_CHAIN_ID: "31337", CLAIM_RPC: RPC, PAY_TO: owner, MIN_BID: "10", CACHED_PRICE: "2", POOL_SHARE: "0.8", SEED_PAID: "0" },
    stdio: ["ignore", "ignore", "inherit"],
  });
  procs.push(server);
  for (let i = 0; ; i++) { try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ } if (i > 120) throw new Error("server didn't start"); await sleep(500); }
  const api = async (path: string, body?: unknown, auth?: string) => {
    const res = await fetch(BASE + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const upload = async (b: Uint8Array) => (await (await fetch(`${BASE}/api/blobs`, { method: "POST", body: b as BodyInit })).json()).hash as string;

  // the order, opened with one small demo job, as the bridge's header comment says
  const opening = Buffer.alloc(116);
  Buffer.from(V.GENESIS_HEADER, "hex").copy(opening, 0, 0, 76);
  opening.writeUInt32LE(0, 76);
  opening.writeUInt32LE(1000, 80);
  shareTarget(1).copy(opening, 84);
  const order = (await api("/api/orders", { wallet: buyer, bid: "40", budget: "2000", spec: { kind: "wasm", program: await upload(PROGRAM), inputs: [await upload(opening)], timeout_s: 120, redundancy: 1, keep_open: true } })).json;
  const payTx = await mined(await rpc("eth_sendTransaction", [{ from: buyer, to: token, data: `0xa9059cbb${word(owner)}${word(BigInt(order.budget_wei))}` }]));
  check("a keep-open hash_search order is live", (await api(`/api/orders/${order.id}/pay`, { tx: payTx })).json?.status === "live", order.id);

  // a miner: claims wasm jobs, runs them as the website does, submits
  const { token: minerToken } = (await api("/api/register", { label: "btc test miner" })).json;
  let minerOn = true;
  let minerJobs = 0;
  const minerLoop = (async () => {
    while (minerOn) {
      const jobs = (await api("/api/claim", { count: 4, kinds: ["wasm"], open_max: 4 }, minerToken)).json?.jobs ?? [];
      for (const j of jobs) {
        const [p, i] = await Promise.all([j.params.program_url, j.params.input_url].map(async (u: string) => new Uint8Array(await (await fetch(BASE + u)).arrayBuffer())));
        const r = await runWasm(p, i, new Uint8Array(32), j.params.max_output);
        await api("/api/submit", { job: j.job, result: { output: Buffer.from(r.output).toString("base64") } }, minerToken);
        minerJobs++;
      }
      if (!jobs.length) await sleep(500);
    }
  })();

  const remote = await startMockPool(3392, 0.0005);
  const r4 = await run(["--pool", "stratum+tcp://127.0.0.1:3392", "--user", "test", "--order", order.id, "--key", order.order_key, "--server", BASE, "--per-job", "2000000", "--ahead", "3", "--shares", "3"], 240_000);
  check("through the network: jobs added, a miner runs them, the pool accepts the shares", r4.code === 0 && remote.shares.accepted >= 3 && remote.shares.rejected === 0 && minerJobs >= 2,
    `${minerJobs} jobs mined · ${remote.shares.accepted} accepted, ${remote.shares.rejected} rejected${r4.code === 0 ? "" : ` · exit ${r4.code}: ${r4.out.slice(-400)}`}`);
  const view = (await api(`/api/orders/${order.id}`)).json;
  check("the order paid for the jobs it settled", view.settled >= 2 && Number(view.spent) === view.settled * 40, `${view.settled} settled, ${view.spent} spent`);
  // ---- 5. the guided setup, answered like a person would, paid on the chain -----------------------------------------
  const wizardPool = await startMockPool(3394, 0.0005);
  const setupFile = join(tmpdir(), `btcpool-setup-${process.pid}.json`);
  cleanup.push(setupFile);
  const wizard = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./start.ts", import.meta.url))], {
    cwd: MINE, env: { ...process.env, FLYAI_SERVER: BASE, BTC_POOL_NO_BROWSER: "1", BTC_POOL_SHARES: "2", BTC_POOL_SETUP: setupFile },
  });
  procs.push(wizard);
  let screen = ""; // what's on screen since the last answer
  let transcript = ""; // everything
  const answers: [RegExp, string][] = [
    [/Which pool\?/, "3"], [/Stratum address/, "stratum+tcp://127.0.0.1:3394"], [/pool login/, "someone.worker1"],
    [/Wallet address/, buyer], [/How many jobs/, "10"],
  ];
  let paidOrder = "";
  wizard.stdout!.on("data", (d) => {
    screen += d;
    transcript += d;
    while (answers.length && answers[0][0].test(screen)) {
      wizard.stdin!.write(`${answers.shift()![1]}
`);
      screen = screen.replace(/[\s\S]*: $/, "");
    }
  });
  wizard.stderr!.on("data", (d) => { transcript += d; });
  const wizardExit = new Promise<number | null>((resolve) => wizard.on("exit", resolve));
  for (let i = 0; i < 240 && !/Waiting for the payment/.test(transcript); i++) await sleep(250);
  const saved = JSON.parse(readFileSync(setupFile, "utf8"));
  const made = (await api(`/api/orders/${saved.order}`)).json;
  check("setup: checks the pool, makes a 10-job keep-open order for the wallet, and waits for payment", /the pool answered/.test(transcript) && made.status === "unpaid"
    && made.wallet.toLowerCase() === buyer.toLowerCase() && Math.round(Number(made.budget)) === 10 * Number(made.bid) /* the budget ends in a few tag wei */ && transcript.includes(`/compute/jobs?pay=${saved.order}`),
    JSON.stringify({ poolChecked: /the pool answered/.test(transcript), status: made.status, wallet: made.wallet, budget: made.budget, bid: made.bid, link: transcript.includes(`/compute/jobs?pay=${saved.order}`) }));
  paidOrder = saved.order;
  const tx = await mined(await rpc("eth_sendTransaction", [{ from: buyer, to: token, data: `0xa9059cbb${word(owner)}${word(BigInt(made.budget_wei))}` }]));
  await api(`/api/orders/${paidOrder}/pay`, { tx });
  const code = await Promise.race([wizardExit, sleep(240_000).then(() => "timeout")]);
  check("setup: sees the payment, starts mining, and the pool accepts shares", code === 0 && wizardPool.shares.accepted >= 2 && wizardPool.shares.rejected === 0,
    `exit ${code} · ${wizardPool.shares.accepted} accepted${code === 0 ? "" : ` · ${transcript.slice(-400)}`}`);
  wizardPool.server.close();

  minerOn = false;
  await minerLoop;
  remote.server.close();
  cleanup.push(`${DB}-blobs`, DB, `${DB}-wal`, `${DB}-shm`);
} catch (err) {
  console.log("crashed:", err);
  failed++;
} finally {
  for (const p of procs) p.kill();
  await sleep(1500);
  await PG.stop();
  for (const path of cleanup) rmSync(path, { recursive: true, force: true });
}
console.log(failed ? `${failed} FAILED` : "btc pool bridge checks passed");
process.exit(failed ? 1 : 0);
