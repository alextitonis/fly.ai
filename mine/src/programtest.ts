/**
 * Buyers' programs: that a hostile module can't hurt a miner, and that program orders work end to end.
 *
 *  1. The sandbox (no server): real Rust modules (examples/) and hand-built hostile ones. Endless loops die at the time
 *     limit, memory can't grow past the cap, output floods stop at the cap, forbidden imports, shared or 64-bit memory
 *     and huge tables are refused, traps and exits become answers, WASI randomness is the same on every miner.
 *  2. Orders (anvil + a server): uploads, a module refused at order time, a WASM order settled by two agreeing
 *     miners who are then paid directly, a disputed job, a shader order agreeing within a float tolerance, more jobs
 *     added and the order stopped with the order key, uploads served as downloads, old clients never handed programs,
 *     and the snapshot paying program earnings on top of points.
 *
 *   npm run test:programs      (needs Foundry for part 2)
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { startPg } from "./pgtest.ts";
import { inspectWasm, MAX_PAGES } from "./wasmcheck.ts";
import { checksumAddress, personalMessageHash } from "./wallet.ts";
import { JobError, runWasm } from "../web/openjob.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const EXAMPLES = fileURLToPath(new URL("../examples/", import.meta.url));
const PI = readFileSync(join(EXAMPLES, "pi-rust/pi.wasm"));
const WORDCOUNT = readFileSync(join(EXAMPLES, "wordcount-wasi/wordcount.wasm"));
const SEED = new Uint8Array(32).fill(9);

// ---- a tiny WebAssembly encoder for hostile modules ----------------------------------------------------------
const leb = (n: number): number[] => {
  const out: number[] = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return out;
};
const sleb = (n: number): number[] => {
  const out: number[] = [];
  for (;;) {
    const b = n & 0x7f;
    n >>= 7;
    if ((n === 0 && !(b & 0x40)) || (n === -1 && b & 0x40)) return [...out, b];
    out.push(b | 0x80);
  }
};
const str = (s: string) => [...leb(s.length), ...new TextEncoder().encode(s)];
const vec = (items: number[][]) => [...leb(items.length), ...items.flat()];
const section = (id: number, body: number[]) => [id, ...leb(body.length), ...body];
const I32 = 0x7f;
interface Mod {
  types?: [number[], number[]][];
  imports?: { module: string; name: string; desc: number[] }[];
  funcs?: { type: number; body: number[] }[];
  tables?: number[][];
  memories?: number[][];
  exports?: { name: string; kind: number; index: number }[];
}
function wasm(m: Mod): Uint8Array {
  const types = m.types ?? [[[], []]];
  const bytes = [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0];
  bytes.push(...section(1, vec(types.map(([p, r]) => [0x60, ...vec(p.map((x) => [x])), ...vec(r.map((x) => [x]))]))));
  if (m.imports) bytes.push(...section(2, vec(m.imports.map((i) => [...str(i.module), ...str(i.name), ...i.desc]))));
  if (m.funcs) bytes.push(...section(3, vec(m.funcs.map((f) => leb(f.type)))));
  if (m.tables) bytes.push(...section(4, vec(m.tables)));
  if (m.memories) bytes.push(...section(5, vec(m.memories)));
  if (m.exports) bytes.push(...section(7, vec(m.exports.map((e) => [...str(e.name), e.kind, ...leb(e.index)]))));
  if (m.funcs) bytes.push(...section(10, vec(m.funcs.map((f) => { const body = [0, ...f.body, 0x0b]; return [...leb(body.length), ...body]; }))));
  return Uint8Array.from(bytes);
}
const mem = (min: number, max?: number) => (max === undefined ? [0x00, ...leb(min)] : [0x01, ...leb(min), ...leb(max)]);
/** a module with memory and one exported function `run` (after any imported functions) */
const runner = (body: number[], extra: Partial<Mod> = {}) => wasm({
  memories: [mem(1)], funcs: [{ type: 0, body }],
  exports: [{ name: "memory", kind: 2, index: 0 }, { name: "run", kind: 0, index: extra.imports?.length ?? 0 }], ...extra,
});
const OUTPUT = { module: "flyai", name: "output", desc: [0, 1] }; // type 1: (i32, i32) -> ()
const refused = (bytes: Uint8Array) => { try { inspectWasm(bytes); return ""; } catch (err) { return String(err); } };
const answer = async (bytes: Uint8Array, input = new Uint8Array(0), maxOutput = 1 << 20, seed = SEED) =>
  runWasm(bytes, input, seed, maxOutput).then((r) => ({ output: r.output }), (err) => ({ error: err instanceof JobError ? err.message : `NOT A JOB ERROR: ${err}` }));

// ---- 1. the sandbox --------------------------------------------------------------------------------------------
{
  const input = new Uint8Array(12);
  new DataView(input.buffer).setBigUint64(0, 7n, true);
  new DataView(input.buffer).setUint32(8, 200_000, true);
  const a = await answer(PI, input);
  const b = await answer(PI, input);
  const hits = "output" in a ? Number(new DataView(a.output.buffer).getBigUint64(0, true)) : 0;
  check("Rust pi (flyai imports) runs, the same twice", "output" in a && "output" in b && hex(a.output) === hex(b.output) && Math.abs((4 * hits) / 200_000 - Math.PI) < 0.02, String((4 * hits) / 200_000));
  const wc = await answer(WORDCOUNT, new TextEncoder().encode("to be or not to be"));
  check("Rust word count (WASI stdin/stdout) runs", "output" in wc && new TextDecoder().decode(wc.output) === "2 be\n2 to\n1 not\n1 or\n");
  check("the inspector caps memory it doesn't limit", inspectWasm(PI).maxPages === MAX_PAGES && inspectWasm(inspectWasm(PI).bytes).bytes.length === inspectWasm(PI).bytes.length);

  check("not WebAssembly: refused", /not a WebAssembly module/.test(refused(new TextEncoder().encode("<html><script>alert(1)</script>"))));
  check("an import from anywhere else: refused", /isn't available/.test(refused(runner([], { types: [[[], []], [[I32, I32], []]], imports: [{ module: "env", name: "fetch", desc: [0, 1] }] }))));
  check("an imported memory: refused", /only functions/.test(refused(wasm({ imports: [{ module: "flyai", name: "memory", desc: [2, ...mem(1)] }] }))));
  check("an imported global: refused", /only functions/.test(refused(wasm({ imports: [{ module: "flyai", name: "g", desc: [3, I32, 0] }] }))));
  check("shared memory (threads): refused", /shared/.test(refused(runner([], { memories: [[0x03, 1, 2]] }))));
  check("64-bit memory: refused", /64-bit/.test(refused(runner([], { memories: [[0x04, 1]] }))));
  check("a memory starting over 256 MiB: refused", /over the limit/.test(refused(runner([], { memories: [mem(MAX_PAGES + 1)] }))));
  check("two memories: refused", /more than one memory/.test(refused(runner([], { memories: [mem(1), mem(1)] }))));
  check("a table of 2 million: refused", /table starts at/.test(refused(runner([], { tables: [[0x70, ...mem(2_000_000)]] }))));
  check("no entry point: refused", /export a function/.test(refused(wasm({ memories: [mem(1)], exports: [{ name: "memory", kind: 2, index: 0 }] }))));
  check("a refused module is a job error on the miner too", /refused/.test(((await answer(runner([], { memories: [[0x03, 1, 2]] }))) as { error: string }).error ?? ""));

  // grow memory 64 MiB at a time until it fails, then output the page count
  const grow = runner([
    0x02, 0x40, 0x03, 0x40, // block, loop
    0x41, ...sleb(1024), 0x40, 0x00, // memory.grow 1024
    0x41, ...sleb(-1), 0x46, 0x0d, 0x01, // == -1 ? break
    0x0c, 0x00, 0x0b, 0x0b, // continue; end loop, end block
    0x41, 0x00, 0x3f, 0x00, 0x36, 0x02, 0x00, // mem[0] = memory.size
    0x41, 0x00, 0x41, 0x04, 0x10, 0x00, // output(0, 4)
  ], { types: [[[], []], [[I32, I32], []]], imports: [OUTPUT] });
  const grown = await answer(grow);
  const pages = "output" in grown ? new DataView(grown.output.buffer).getUint32(0, true) : -1;
  check("a memory bomb stops at the cap: memory.grow fails, the module carries on", pages > 0 && pages <= MAX_PAGES, `${pages} pages`);

  const flood = await answer(runner([0x41, 0x00, 0x41, ...sleb(65536), 0x10, 0x00], { types: [[[], []], [[I32, I32], []]], imports: [OUTPUT] }), new Uint8Array(0), 1000);
  check("an output flood stops at the cap", "error" in flood && /output over the limit/.test(flood.error), JSON.stringify(flood));
  const trap = await answer(runner([0x00]));
  check("a trap is an answer, the same on every engine", "error" in trap && trap.error === "trap");
  const exit = await answer(wasm({
    types: [[[], []], [[I32], []]], imports: [{ module: "wasi_snapshot_preview1", name: "proc_exit", desc: [0, 1] }], memories: [mem(1)],
    funcs: [{ type: 0, body: [0x41, 0x03, 0x10, 0x00] }], exports: [{ name: "memory", kind: 2, index: 0 }, { name: "_start", kind: 0, index: 1 }],
  }));
  check("a nonzero WASI exit is an answer", "error" in exit && exit.error === "exited with code 3");
  const unknownWasi = await answer(wasm({
    types: [[[], []], [[I32, I32], [I32]], [[I32, I32], []]],
    imports: [{ module: "wasi_snapshot_preview1", name: "sock_open", desc: [0, 1] }, { module: "flyai", name: "output", desc: [0, 2] }],
    memories: [mem(1)],
    funcs: [{ type: 0, body: [0x41, 0x00, 0x41, 0x00, 0x41, 0x00, 0x10, 0x00, 0x36, 0x02, 0x00, 0x41, 0x00, 0x41, 0x04, 0x10, 0x01] }],
    exports: [{ name: "memory", kind: 2, index: 0 }, { name: "run", kind: 0, index: 2 }],
  }));
  check("WASI calls outside the subset (sockets) just get ENOSYS", "output" in unknownWasi && new DataView(unknownWasi.output.buffer).getUint32(0, true) === 52);
  const randomModule = wasm({
    types: [[[], []], [[I32, I32], [I32]], [[I32, I32], []]],
    imports: [{ module: "wasi_snapshot_preview1", name: "random_get", desc: [0, 1] }, { module: "flyai", name: "output", desc: [0, 2] }],
    memories: [mem(1)],
    funcs: [{ type: 0, body: [0x41, 0x00, 0x41, 0x20, 0x10, 0x00, 0x1a, 0x41, 0x00, 0x41, 0x20, 0x10, 0x01] }],
    exports: [{ name: "memory", kind: 2, index: 0 }, { name: "run", kind: 0, index: 2 }],
  });
  const r1 = await answer(randomModule);
  const r2 = await answer(randomModule);
  const r3 = await answer(randomModule, new Uint8Array(0), 1 << 20, new Uint8Array(32).fill(1));
  check("WASI randomness is the same for every miner of a job, different per job", "output" in r1 && "output" in r2 && "output" in r3
    && hex(r1.output) === hex(r2.output) && hex(r1.output) !== hex(r3.output) && r1.output.some((x) => x !== 0));

  // fuzzing the inspector, which the server runs on every buyer's module: whatever the bytes, it may only return or
  // throw WasmError, quickly. 20,000 corrupted, truncated, spliced and random modules.
  let state = 0x9e3779b9;
  const rand = (n: number) => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) % n;
  };
  const bases = [PI, WORDCOUNT, grow];
  let escaped = "";
  let accepted = 0;
  let slowest = 0;
  for (let i = 0; i < 20_000; i++) {
    const base = bases[rand(bases.length)];
    let bytes = Uint8Array.from(base);
    const how = rand(5);
    if (how === 0) for (let k = rand(16) + 1; k > 0; k--) bytes[8 + rand(bytes.length - 8)] = rand(256);
    else if (how === 1) bytes = bytes.subarray(0, rand(bytes.length));
    else if (how === 2) { const at = 8 + rand(bytes.length - 8); bytes = Uint8Array.from([...bytes.subarray(0, at), ...Array.from({ length: rand(64) }, () => rand(256)), ...bytes.subarray(at)]); }
    else if (how === 3) { bytes = Uint8Array.from([...bytes.subarray(0, 8), ...Array.from({ length: rand(4096) }, () => rand(256))]); }
    else for (let k = 0; k < 8; k++) bytes[9 + rand(Math.min(64, bytes.length - 9))] = [0x80, 0xff, 0x7f, 0][rand(4)]; // LEB128 edge bytes near the headers
    const t = performance.now();
    try {
      const r = inspectWasm(bytes);
      accepted++;
      if (r.bytes.length > bytes.length + 64) escaped ||= `output grew from ${bytes.length} to ${r.bytes.length}`;
    } catch (err) {
      if (!(err instanceof Error) || err.constructor.name !== "WasmError") escaped ||= `${err}`;
    }
    slowest = Math.max(slowest, performance.now() - t);
  }
  check("fuzz: 20,000 broken modules only ever give a clean refusal or a capped module", !escaped, escaped || `${accepted} still valid enough, slowest ${slowest.toFixed(1)} ms`);
  const huge = new Uint8Array(8 * 1024 * 1024);
  huge.set([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
  for (let i = 8; i < huge.length; i++) huge[i] = rand(256);
  const tHuge = performance.now();
  const hugeResult = refused(huge);
  check("an 8 MiB module of junk is refused fast", !!hugeResult && performance.now() - tHuge < 500, `${(performance.now() - tHuge).toFixed(0)} ms`);
  check("anything over 8 MiB is refused before it's read", /the limit is/.test(refused(new Uint8Array(8 * 1024 * 1024 + 1))));

  // an endless loop, run the way a miner runs it: in its own worker, terminated at the time limit
  const endless = runner([0x03, 0x40, 0x0c, 0x00, 0x0b]);
  const openjob = new URL("../web/openjob.ts", import.meta.url).href;
  const worker = new Worker(`import(${JSON.stringify(openjob)}).then(async (m) => { const { parentPort, workerData } = await import("node:worker_threads");
    await m.runWasm(workerData.bytes, new Uint8Array(0), new Uint8Array(32), 1024); parentPort.postMessage("finished"); });`,
  { eval: true, workerData: { bytes: endless } });
  const outcome = await new Promise<string>((resolve) => {
    worker.on("message", () => resolve("finished"));
    worker.on("error", (err) => resolve(`error ${err}`));
    setTimeout(() => void worker.terminate().then(() => resolve("timeout")), 1500);
  });
  check("an endless loop runs until the time limit, then dies with its worker", outcome === "timeout", outcome);
}

// ---- 2. orders ----------------------------------------------------------------------------------------------
const RPC = "http://127.0.0.1:8548";
const PORT = 8785;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-programtest-${process.pid}.db`);
const BLOBS = join(tmpdir(), `mine-programtest-blobs-${process.pid}`);
const WEI = 10n ** 18n;
const anvil = spawn("anvil", ["--port", "8548"], { stdio: ["ignore", "pipe", "ignore"] });
let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5535);
try {
  const keys: string[] = await new Promise((resolve, reject) => {
    let out = "";
    anvil.stdout!.on("data", (d) => {
      out += d;
      const found = [...out.matchAll(/\(\d+\) 0x([0-9a-f]{64})/g)].map((m) => m[1]);
      if (found.length >= 4 && out.includes("Listening on")) resolve(found);
    });
    anvil.on("exit", () => reject(new Error("anvil exited")));
  });
  const [owner, buyer, minerA, minerB] = keys.slice(0, 4).map((k) => {
    const sk = Uint8Array.from(Buffer.from(k, "hex"));
    const sign = (message: string) => {
      const sig = secp256k1.sign(personalMessageHash(message), sk, { prehash: false, format: "recovered" });
      return `0x${hex(sig.subarray(1))}${(sig[0] + 27).toString(16)}`;
    };
    return { key: `0x${k}`, address: checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`), sign };
  });
  const rpc = async (method: string, params: unknown[]) => {
    const res = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json();
    if (res.error) throw new Error(res.error.message);
    return res.result;
  };
  const selector = (sig: string) => hex(keccak_256(new TextEncoder().encode(sig)).subarray(0, 4));
  const word = (v: bigint | string) => (typeof v === "string" ? v.replace(/^0x/, "").toLowerCase().padStart(64, "0") : v.toString(16).padStart(64, "0"));
  const calldata = (sig: string, ...args: (bigint | string)[]) => `0x${selector(sig)}${args.map(word).join("")}`;
  const sendTx = async (from: string, to: string, data: string) => {
    const hash = await rpc("eth_sendTransaction", [{ from, to, data }]);
    for (let i = 0; i < 50 && !(await rpc("eth_getTransactionReceipt", [hash])); i++) await sleep(100);
    return hash as string;
  };
  for (let i = 0; ; i++) {
    try { await rpc("eth_chainId", []); break; } catch { if (i > 50) throw new Error("anvil didn't start"); await sleep(200); }
  }
  const out = execFileSync("forge", ["create", "test/MonthlyClaims.t.sol:TestToken", "--rpc-url", RPC, "--private-key", owner.key, "--broadcast"],
    { cwd: fileURLToPath(new URL("../contracts/", import.meta.url)), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const token = /Deployed to: (0x[0-9a-fA-F]{40})/.exec(out)![1];
  await sendTx(owner.address, token, calldata("mint(address,uint256)", buyer.address, 100_000n * WEI));

  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  rmSync(BLOBS, { recursive: true, force: true });
  server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", fileURLToPath(new URL("./server.ts", import.meta.url))], {
    env: {
      ...process.env, PORT: String(PORT), MINE_DB: DB, MINE_PG_URL: PG.url, BLOBS_DIR: BLOBS, VERIFIERS: "1", CANARY_POOL: "0", CANARY_RATE: "0", AUDITS: "0", OPEN_TARGET: "20",
      ADMIN_TOKEN: ADMIN, TOKEN_ADDRESS: token, CLAIM_CHAIN_ID: "31337", CLAIM_RPC: RPC, PAY_TO: owner.address, MIN_BID: "10", POOL_SHARE: "0.8",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/api/model`)).ok) break; } catch { /* starting */ }
    if (i > 120) throw new Error("server didn't start");
    await sleep(500);
  }
  const api = async (path: string, body?: unknown, auth?: string) => {
    const res = await fetch(BASE + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  const upload = async (bytes: Uint8Array) => (await (await fetch(`${BASE}/api/blobs`, { method: "POST", body: bytes as BodyInit })).json()).hash as string;
  const pay = async (o: any) => api(`/api/orders/${o.id}/pay`, { tx: await sendTx(buyer.address, token, calldata("transfer(address,uint256)", owner.address, BigInt(o.budget_wei))) });
  const miner = async (w?: typeof minerA) => {
    const { json } = await api("/api/register", {});
    if (w) {
      const n = await api("/api/auth/nonce", { address: w.address }, json.token);
      await api("/api/auth/verify", { nonce: n.json.nonce, signature: w.sign(n.json.message) });
    }
    return json.token as string;
  };

  // the server under junk: big uploads and orders for them at once, oversize bodies, nonsense claims
  const junkUploads = await Promise.all(Array.from({ length: 24 }, (_, i) => {
    const b = new Uint8Array(6 * 1024 * 1024);
    b.set([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
    for (let k = 8; k < b.length; k += 7) b[k] = (k * (i + 3)) & 255;
    return upload(b);
  }));
  const junkOrders = await Promise.all(junkUploads.map((h) => api("/api/orders", { wallet: buyer.address, bid: "20", budget: "100", spec: { kind: "wasm", program: h, inputs: [h] } })));
  const tooBig = await fetch(`${BASE}/api/blobs`, { method: "POST", body: new Uint8Array(9 * 1024 * 1024) as BodyInit }).then((r) => r.status, () => 413);
  const nonsense = await Promise.all([
    fetch(`${BASE}/api/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: "{".repeat(100_000) }).then((r) => r.status),
    api("/api/orders", { wallet: buyer.address, bid: "20", budget: "100", spec: { kind: "wgsl", program: junkUploads[0], inputs: [junkUploads[0]], dispatch: [1], output_bytes: 4 } }),
  ]);
  const t0 = performance.now();
  const alive = await api("/api/stats");
  check("24 junk 6 MiB modules ordered at once: all refused, and the server keeps answering",
    junkOrders.every((r) => r.status === 400) && tooBig === 413 && nonsense[0] === 400 && nonsense[1].status === 400
    && alive.status === 200 && performance.now() - t0 < 2000, `${junkOrders.map((r) => r.status).join(",")} · big ${tooBig} · ${nonsense.map((n) => (typeof n === "number" ? n : n.status)).join(",")}`);

  const program = await upload(PI);
  const served = await fetch(`${BASE}/api/blobs/${program}`);
  check("uploads are served as downloads that can't script the site", served.headers.get("content-disposition")?.startsWith("attachment") === true
    && served.headers.get("x-content-type-options") === "nosniff" && /sandbox/.test(served.headers.get("content-security-policy") ?? "")
    && Buffer.from(await served.arrayBuffer()).equals(PI));
  const inputs: string[] = [];
  for (let s = 1; s <= 3; s++) {
    const b = new Uint8Array(12);
    new DataView(b.buffer).setBigUint64(0, BigInt(s), true);
    new DataView(b.buffer).setUint32(8, 50_000, true);
    inputs.push(await upload(b));
  }
  const bad = await upload(runner([], { types: [[[], []], [[I32, I32], []]], imports: [{ module: "env", name: "fetch", desc: [0, 1] }] }));
  const refusedOrder = await api("/api/orders", { wallet: buyer.address, bid: "20", budget: "100", spec: { kind: "wasm", program: bad, inputs } });
  check("a module with a forbidden import is refused when ordering", refusedOrder.status === 400 && /program refused/.test(refusedOrder.json.error), refusedOrder.json?.error);
  check("an input nobody uploaded is refused", (await api("/api/orders", { wallet: buyer.address, bid: "20", budget: "100", spec: { kind: "wasm", program, inputs: ["ab".repeat(32)] } })).status === 400);
  check("a bid under the time-scaled minimum is refused", (await api("/api/orders", { wallet: buyer.address, bid: "10", budget: "100", spec: { kind: "wasm", program, inputs, timeout_s: 90 } })).status === 400);

  const order = (await api("/api/orders", { wallet: buyer.address, bid: "20", budget: "200", spec: { kind: "wasm", program, inputs, timeout_s: 30, redundancy: 2, keep_open: true } })).json;
  check("a WASM order: capped module, an order key once", order?.kind === "wasm" && order.spec.program !== program && /^[0-9a-f]{48}$/.test(order.order_key ?? "") && order.jobs === 3, JSON.stringify(order?.spec));
  check("it starts when paid", (await pay(order)).json?.status === "live");

  const [ta, tb, tc, old] = [await miner(minerA), await miner(minerB), await miner(), await miner()];
  const oldClaim = (await api("/api/claim", { count: 16 }, old)).json?.jobs ?? [];
  check("a claim for a kind nobody offers is refused", (await api("/api/claim", { count: 4, kinds: ["python"] }, old)).status === 400);
  check("a miner that doesn't say what it runs never gets programs", oldClaim.every((j: any) => j.kind === "connectome"));
  const claim = async (t: string, n = 8, openMax = 8) => ((await api("/api/claim", { count: n, kinds: ["wasm"], open_max: openMax }, t)).json?.jobs ?? []) as any[];
  const run = async (j: any) => {
    const [p, i] = await Promise.all([j.params.program_url, j.params.input_url].map(async (u: string | null) =>
      (u ? new Uint8Array(await (await fetch(BASE + u)).arrayBuffer()) : new Uint8Array(new Uint32Array([j.params.index]).buffer))));
    const r = await answer(p, i, j.params.max_output);
    return "output" in r ? { output: Buffer.from(r.output).toString("base64") } : r;
  };
  const a = await claim(ta);
  check("open_max limits programs per claim", (await claim(tc, 8, 1)).length <= 1);
  check("a program miner gets the jobs, with fetch URLs and limits", a.length >= 2 && a.every((j) => j.kind === "wasm" && j.params.timeout_s === 30 && j.params.program_url), `${a.length}`);
  for (const j of a) await api("/api/submit", { job: j.job, result: await run(j) }, ta);
  check("one answer settles nothing", (await api(`/api/orders/${order.id}`)).json.settled === 0);
  const b = await claim(tb);
  for (const j of b) await api("/api/submit", { job: j.job, result: await run(j) }, tb);
  const agreed = (await api(`/api/orders/${order.id}/results`)).json;
  check("two wallets agreeing settle it and charge the bid", agreed.rows.length === b.length && agreed.rows.every((r: any) => r.checked_by === "agreement" && r.output?.url)
    && (await api(`/api/orders/${order.id}`)).json.spent === String(20 * b.length), `${agreed.rows.length} rows`);
  const got = new Uint8Array(await (await fetch(BASE + agreed.rows[0].output.url)).arrayBuffer());
  check("the output is downloadable and right", got.length === 8 && Math.abs((4 * Number(new DataView(got.buffer).getBigUint64(0, true))) / 50_000 - Math.PI) < 0.05);

  // disputed: redundancy 2, four wallets, four different answers (the last job of the order, plus one more added)
  const more = await upload(new Uint8Array(12).fill(5));
  check("more jobs need the order key", (await api(`/api/orders/${order.id}/jobs`, { inputs: [more] })).status === 401);
  const added = await api(`/api/orders/${order.id}/jobs`, { inputs: [more] }, order.order_key);
  check("the order key adds jobs to a live order", added.json?.jobs === 4, JSON.stringify(added.json?.jobs));
  const liars = [ta, tb, tc, old]; // (5 new miners per IP per hour: no more registrations here)
  let disputedRows = 0;
  for (let round = 0; round < 6 && !disputedRows; round++) {
    for (const [k, t] of liars.entries()) {
      for (const j of await claim(t)) await api("/api/submit", { job: j.job, result: { output: Buffer.from(`liar ${k} ${round}`).toString("base64") } }, t);
    }
    disputedRows = (await api(`/api/orders/${order.id}/results`)).json.rows.filter((r: any) => r.checked_by === "disputed").length;
  }
  const rows = (await api(`/api/orders/${order.id}/results`)).json.rows;
  const disputedRow = rows.find((r: any) => r.checked_by === "disputed");
  check("miners who never agree: the buyer gets every answer as disputed", !!disputedRow && disputedRow.answers.length >= 4 && disputedRow.output === null, JSON.stringify(disputedRow?.answers?.length));
  check("no strikes over programs", (await api("/api/me", undefined, tc)).json.lifetime_rejected === 0);
  const csv = await api(`/api/orders/${order.id}/results?format=csv`);
  check("CSV lists outputs", csv.text.startsWith("seq,index,input,checked_by,output,size,error"));

  // program pay reaches Postgres through pg_outbox, sent every second
  await api("/api/admin/orders", undefined, ADMIN);
  const paid = (await PG.pg.all<{ wallet: string; t: string }>("select wallet, sum(amount_wei::numeric) / 1e18 as t from mine.earnings group by wallet"))
    .map((p) => ({ wallet: p.wallet, t: Number(p.t) }));
  check("agreeing miners are paid the pool part directly: 80% of each 20 split between two wallets",
    paid.some((p) => p.wallet === minerA.address && p.t >= 8 * b.length - 1e-9) && paid.some((p) => p.wallet === minerB.address), JSON.stringify(paid));

  const stopped = await api(`/api/orders/${order.id}/stop`, {}, order.order_key);
  check("the order key stops it; the rest goes back to the balance", stopped.json?.status === "ended" && stopped.json.end_reason === "stopped" && Number(stopped.json.returned) > 0, JSON.stringify(stopped.json?.status));

  // count: jobs whose input is their index, no uploads; one miner is enough at redundancy 1
  const echo = await upload(runner([
    0x41, 0x00, 0x10, 0x01, // input_read(0)
    0x41, 0x00, 0x10, 0x00, 0x10, 0x02, // output(0, input_len())
  ], { types: [[[], []], [[], [I32]], [[I32], []], [[I32, I32], []]], imports: [
    { module: "flyai", name: "input_len", desc: [0, 1] }, { module: "flyai", name: "input_read", desc: [0, 2] }, { module: "flyai", name: "output", desc: [0, 3] },
  ] }));
  const counted = (await api("/api/orders", { wallet: buyer.address, bid: "20", budget: "60", spec: { kind: "wasm", program: echo, count: 3, redundancy: 1 } })).json;
  await pay(counted);
  const cj = await claim(ta);
  for (const j of cj) await api("/api/submit", { job: j.job, result: await run(j) }, ta);
  const cr = (await api(`/api/orders/${counted.id}/results`)).json;
  const indices = cr.rows.map((r: any) => r.index).sort().join();
  check("count: 3 jobs with no uploads, each given its index; redundancy 1 trusts one miner", cj.every((j) => j.params.input_url === null) && cr.status === "done"
    && cr.rows.length === 3 && indices === "0,1,2" && cr.rows.every((r: any) => r.checked_by === "single" && r.input === null && r.output.size === 4), JSON.stringify(cr.rows.map((r: any) => r.checked_by)));

  // a shader order: floats within the tolerance agree
  const shader = await upload(new TextEncoder().encode(`
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3<u32>) { output[id.x] = input[id.x] * 2.0; }`));
  const floats = await upload(new Uint8Array(new Float32Array([1, 2, 3, 4]).buffer));
  check("a shader needs dispatch and output_bytes", (await api("/api/orders", { wallet: buyer.address, bid: "20", budget: "40", spec: { kind: "wgsl", program: shader, inputs: [floats] } })).status === 400);
  const gpu = (await api("/api/orders", { wallet: buyer.address, bid: "20", budget: "40", spec: { kind: "wgsl", program: shader, inputs: [floats], dispatch: [4], output_bytes: 16, compare: { f32_tolerance: 0.001 } } })).json;
  await pay(gpu);
  check("a CPU-only claim gets no shaders", !((await api("/api/claim", { count: 4, kinds: ["wasm"], open_max: 4 }, tc)).json?.jobs ?? []).some((j: any) => j.kind === "wgsl"));
  const f = (xs: number[]) => Buffer.from(new Float32Array(xs).buffer).toString("base64");
  // a job has one holder at a time: the second GPU gets it once the first has answered
  const g1 = (await api("/api/claim", { count: 4, kinds: ["wgsl"], open_max: 4 }, ta)).json.jobs;
  check("a wrong-size shader output is refused", (await api("/api/submit", { job: g1[0].job, result: { output: f([2, 4, 6]) } }, ta)).status === 400);
  await api("/api/submit", { job: g1[0].job, result: { output: f([2, 4, 6, 8]) } }, ta);
  const g2 = (await api("/api/claim", { count: 4, kinds: ["wgsl"], open_max: 4 }, tb)).json.jobs;
  await api("/api/submit", { job: g2[0].job, result: { output: f([2.0004, 4, 5.9996, 8]) } }, tb);
  const gr = (await api(`/api/orders/${gpu.id}/results`)).json;
  check("two GPUs within the tolerance agree", gr.rows[0]?.checked_by === "agreement" && gr.status === "done", JSON.stringify(gr.rows[0]?.checked_by));

  // an embed order: texts in, vectors out, answers agree by cosine similarity
  const texts = (xs: unknown) => upload(new TextEncoder().encode(JSON.stringify(xs)));
  const batchA = await texts(["the fly smells vinegar", "a looming shadow"]);
  const batchB = await texts(["wind on the antennae"]);
  const embedOrder = (spec: Record<string, unknown>) => api("/api/orders", { wallet: buyer.address, bid: "40", budget: "120", spec: { kind: "embed", model: "minilm-l6", ...spec } });
  check("embed: an unknown model is refused", (await embedOrder({ model: "gpt-9", inputs: [batchA] })).status === 400);
  check("embed: count is refused (texts are inputs)", (await embedOrder({ inputs: undefined, count: 3 })).status === 400);
  check("embed: an input that isn't a JSON array of texts is refused", (await embedOrder({ inputs: [floats] })).status === 400
    && (await embedOrder({ inputs: [await texts([])] })).status === 400 && (await embedOrder({ inputs: [await texts(["ok", 7])] })).status === 400
    && (await embedOrder({ inputs: [await texts(Array.from({ length: 257 }, (_, i) => `t${i}`))] })).status === 400);
  check("embed: a cosine bar under 0.9 is refused", (await embedOrder({ inputs: [batchA], compare: { cosine: 0.5 } })).status === 400);
  const cfg = (await api("/api/orders/config")).json;
  check("embed: the config lists the kind and its models", cfg.kinds.includes("embed") && cfg.embed?.models?.["minilm-l6"]?.dim === 384);
  const emb = (await embedOrder({ inputs: [batchA, batchB] })).json;
  await pay(emb);
  check("embed: a claim without the kind gets no embed jobs", !((await api("/api/claim", { count: 4, kinds: ["wasm", "wgsl"], open_max: 4 }, tc)).json?.jobs ?? []).some((j: any) => j.kind === "embed"));
  const DIM = 384;
  // a unit vector per text, from a seed; "noisy" nudges it the way another GPU's rounding would
  const vectors = (rows: number, seed: number, noise = 0) => {
    const v = new Float32Array(rows * DIM);
    for (let r = 0; r < rows; r++) {
      let n = 0;
      for (let k = 0; k < DIM; k++) {
        v[r * DIM + k] = Math.sin(seed * 131 + r * 17 + k * 0.37) + (noise ? Math.sin(k * 7.1 + r) * noise : 0);
        n += v[r * DIM + k] ** 2;
      }
      for (let k = 0; k < DIM; k++) v[r * DIM + k] /= Math.sqrt(n);
    }
    return Buffer.from(v.buffer).toString("base64");
  };
  const e1 = ((await api("/api/claim", { count: 4, kinds: ["embed"], open_max: 4 }, ta)).json?.jobs ?? []) as any[];
  const byIndex = (js: any[], i: number) => js.find((j) => j.params.index === i);
  const j0 = byIndex(e1, 0);
  check("embed: a claimed job names the pinned model and the exact output size", e1.length === 2 && j0?.params.repo === "Xenova/all-MiniLM-L6-v2"
    && /^[0-9a-f]{40}$/.test(j0?.params.revision) && j0?.params.output_bytes === 2 * DIM * 4 && byIndex(e1, 1)?.params.output_bytes === DIM * 4, JSON.stringify(j0?.params));
  check("embed: an error answer is refused", (await api("/api/submit", { job: j0.job, result: { error: "out of memory" } }, ta)).status === 400);
  check("embed: a wrong-size answer is refused", (await api("/api/submit", { job: j0.job, result: { output: vectors(1, 1) } }, ta)).status === 400);
  await api("/api/submit", { job: j0.job, result: { output: vectors(2, 1) } }, ta);
  await api("/api/submit", { job: byIndex(e1, 1).job, result: { output: vectors(1, 2) } }, ta);
  const e2 = ((await api("/api/claim", { count: 4, kinds: ["embed"], open_max: 4 }, tb)).json?.jobs ?? []) as any[];
  await api("/api/submit", { job: byIndex(e2, 0).job, result: { output: vectors(2, 1, 0.003) } }, tb); // cosine ~0.99999: agrees
  await api("/api/submit", { job: byIndex(e2, 1).job, result: { output: vectors(1, 99) } }, tb); // made up: doesn't
  let er = (await api(`/api/orders/${emb.id}/results`)).json;
  check("embed: vectors within the cosine bar agree; a made-up vector doesn't", er.rows.length === 1 && er.rows[0].index === 0 && er.rows[0].checked_by === "agreement",
    JSON.stringify(er.rows.map((r: any) => [r.index, r.checked_by])));
  const e3 = ((await api("/api/claim", { count: 4, kinds: ["embed"], open_max: 4 }, tc)).json?.jobs ?? []) as any[];
  await api("/api/submit", { job: byIndex(e3, 1).job, result: { output: vectors(1, 2, 0.001) } }, tc);
  er = (await api(`/api/orders/${emb.id}/results`)).json;
  check("embed: a third honest miner settles the job the liar held up", er.status === "done" && er.rows.length === 2 && er.rows.every((r: any) => r.checked_by === "agreement" && r.output.size > 0),
    JSON.stringify([er.status, er.rows.map((r: any) => r.checked_by)]));

  // the month's claims pay program earnings on top of points
  await api("/api/admin/orders", undefined, ADMIN); // sends what's still queued
  await PG.pg.run("update mine.earnings set month = '2026-08'");
  await PG.pg.run("update mine.ledger set month = '2026-08' where kind = 'charge'");
  const earnedA = (await PG.pg.all<{ amount_wei: string }>("select amount_wei from mine.earnings where wallet = ?", minerA.address))
    .reduce((sum, r) => sum + BigInt(r.amount_wei), 0n);
  const snap = await api("/api/admin/snapshot", { month: "2026-08" }, ADMIN);
  const claimA = (await api(`/api/claims?wallet=${minerA.address}`)).json.claims[0];
  check("the snapshot pays each wallet its program earnings", snap.status === 200 && claimA && BigInt(claimA.amount_wei) >= earnedA, `${snap.json?.pool} pool, A claims ${claimA?.amount}`);
} catch (err) {
  console.log("test crashed:", err);
  failed++;
} finally {
  server?.kill();
  anvil.kill();
  await sleep(300);
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) try { rmSync(DB + suffix, { force: true }); } catch { /* still open after a crash */ }
  rmSync(BLOBS, { recursive: true, force: true });
}
console.log(failed ? `${failed} FAILED` : "program checks passed");
process.exit(failed ? 1 : 0);
