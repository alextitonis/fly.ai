/**
 * Training on the fleet (src/train.ts, mine/TRAIN-PLAN.md), end to end.
 *
 *  1. The math, no server: the noise is the same bits every time, ES climbs a sphere, the MLP learns two spirals with
 *     outer DiLoCo steps, shards round-trip, honest answers agree and doctored ones don't, the WebAssembly templates
 *     (examples/es-cartpole, examples/train-logreg) run in the miners' sandbox and give the same bytes twice.
 *  2. Runs on a real server (anvil + Postgres): a paid evolve run quoted, created, paid and driven to its last
 *     generation by two miners (a third one lying about its scores earns nothing), with miners paid from the charges
 *     and the unspent budget returned; house runs for the MLP (train), the cart-pole WebAssembly fitness and the
 *     integer fly brain (esb); text completion orders settling by prefix agreement; and the refusals.
 *
 *   npm run test:train      (part 2 needs Foundry; the brain run loads the connectome: ~20 s)
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { cells } from "../../world/src/connectome.ts";
import { fixedFrom } from "./fixed.ts";
import { loadModel } from "./load.ts";
import { prefixAgree } from "./orders.ts";
import { startPg } from "./pgtest.ts";
import { recordSets, runProbe } from "./probe.ts";
import * as T from "./train.ts";
import { checksumAddress } from "./wallet.ts";
import { runWasm } from "../web/openjob.ts";
import { runBrainEs, runEs, runSgd } from "../web/trainjob.ts";

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));
const CARTPOLE = readFileSync(fileURLToPath(new URL("../examples/es-cartpole/es_cartpole.wasm", import.meta.url)));
const LOGREG = readFileSync(fileURLToPath(new URL("../examples/train-logreg/train_logreg.wasm", import.meta.url)));

/** Two interleaved spirals: the classic problem a linear model can't solve and a small MLP can. */
function spirals(n: number, seed: number) {
  const r = T.rng(seed);
  const x = new Float32Array(n * 2);
  const labels = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const c = i % 2;
    const t = r() * 3 * Math.PI;
    const rad = (t / (3 * Math.PI)) * 2;
    x[2 * i] = rad * Math.cos(t + c * Math.PI) + 0.05 * (r() - 0.5);
    x[2 * i + 1] = rad * Math.sin(t + c * Math.PI) + 0.05 * (r() - 0.5);
    labels[i] = c;
  }
  return T.encodeShard({ x, xDim: 2, labels, classes: 2 });
}
/** Three Gaussian-ish blobs: linearly separable, for the softmax-regression template. */
function blobs(n: number, seed: number) {
  const r = T.rng(seed);
  const x = new Float32Array(n * 2);
  const labels = new Uint32Array(n);
  const centers = [[2, 0], [-1, 1.7], [-1, -1.7]];
  for (let i = 0; i < n; i++) {
    const c = i % 3;
    x[2 * i] = centers[c][0] + (r() + r() - 1) * 0.8;
    x[2 * i + 1] = centers[c][1] + (r() + r() - 1) * 0.8;
    labels[i] = c;
  }
  return T.encodeShard({ x, xDim: 2, labels, classes: 3 });
}

// ---- 1. the math -------------------------------------------------------------------------------------------------
{
  const a = T.noiseInto(12345, new Float64Array(10_000));
  const b = T.noiseInto(12345, new Float64Array(10_000));
  let mean = 0;
  let sq = 0;
  for (const v of a) { mean += v; sq += v * v; }
  mean /= a.length;
  check("noise is the same bits from the same seed, mean ~0 and variance ~1", same(T.f64Bytes(a), T.f64Bytes(b)) && Math.abs(mean) < 0.03 && Math.abs(sq / a.length - 1) < 0.05,
    `mean ${mean.toFixed(4)}, var ${(sq / a.length).toFixed(4)}`);
  check("pair seeds never collide with the center (0)", Array.from({ length: 5000 }, (_, i) => T.pairSeed(7, 3, i)).every((s) => s !== 0));
  check("centered ranks: ties share, the range is -0.5..0.5", JSON.stringify(T.centeredRanks([3, 1, 2, 2])) === JSON.stringify([0.5, -0.5, 0, 0]));

  const r = T.runSpec({ kind: "evolve", dim: 10, pairs: 24, pairs_per_job: 6, generations: 80, sigma: 0.2, lr: 0.15, fitness: { builtin: "sphere", target: [1, -1, 2, 0, 0.5, -2, 1, 1, -0.5, 0] } }) as T.EvolveRun;
  let theta: Float64Array = new Float64Array(10);
  const st = T.esState(10);
  let first = 0;
  let last = 0;
  for (let g = 0; g < r.generations; g++) {
    const pairs: { seed: number; plus: number; minus: number }[] = [];
    for (const job of T.evolveJobs("math", r, g, "0".repeat(64))) {
      const out = T.readF64(await T.runEsJob(job, theta, (x) => T.builtinScore(r.fitness as never, x)));
      job.seeds.forEach((s, k) => {
        if (s === 0) { if (g === 0) first = out[0]; last = out[0]; } else pairs.push({ seed: s, plus: out[2 * k], minus: out[2 * k + 1] });
      });
    }
    theta = T.esStep(r, theta, st, pairs).theta;
  }
  check("ES climbs a 10-dim sphere toward its target", first < -10 && last > -0.5, `${first.toFixed(2)} -> ${last.toFixed(3)}`);

  const shard = T.decodeShard(spirals(1600, 3));
  check("a shard round-trips", shard.rows === 1600 && shard.xDim === 2 && shard.labels!.length === 1600 && same(T.encodeShard({ x: shard.x, xDim: 2, labels: shard.labels!, classes: 2 }), spirals(1600, 3)));
  const tr = T.runSpec({ kind: "train", model: { mlp: { layers: [2, 24, 24, 2] } }, shards: ["a".repeat(64)], rounds: 30, local_steps: 25, batch: 32, lr: 0.01 }) as T.TrainRun;
  const m = (tr.model as { mlp: T.MlpSpec }).mlp;
  let w = T.mlpInit(m, 9);
  const mom = new Float32Array(w.length);
  const before = T.mlpEval(m, w, shard);
  let honest: Uint8Array | null = null;
  let again: Uint8Array | null = null;
  for (let round = 0; round < tr.rounds; round++) {
    const deltas = [];
    for (let k = 0; k < 3; k++) {
      const res = T.mlpTrain(m, w, shard, { steps: 25, batch: 32, lr: 0.01, seed: round * 7 + k, weight_decay: 0 });
      deltas.push(res.delta);
      if (round === 0 && k === 0) {
        honest = T.sgdAnswer(res.delta, res.loss, res.acc);
        const re = T.mlpTrain(m, w, shard, { steps: 25, batch: 32, lr: 0.01, seed: 0, weight_decay: 0 });
        again = T.sgdAnswer(re.delta, re.loss, re.acc);
      }
    }
    w = T.outerStep(tr, w, mom, deltas).theta;
  }
  const after = T.mlpEval(m, w, shard);
  check("the MLP learns two spirals with outer (DiLoCo) steps", before.acc < 0.7 && after.acc > 0.9, `acc ${before.acc.toFixed(3)} -> ${after.acc.toFixed(3)}`);
  const P = w.length;
  const scaled = T.readF32(honest!).map((v, i) => (i < P ? v * 1.5 : v));
  const flipped = T.readF32(honest!).map((v, i) => (i < P && i % 3 === 0 ? -v : v));
  check("weight changes: a rerun agrees, a scaled or doctored one doesn't", T.deltaAgree(honest!, again!, P, 0.999)
    && !T.deltaAgree(honest!, T.f32Bytes(scaled), P, 0.999) && !T.deltaAgree(honest!, T.f32Bytes(flipped), P, 0.999));
  const s1 = T.f64Bytes(new Float64Array([1, 2, 3, 4]));
  check("scores agree within 1e-9 relative, and not past it", T.scoresAgree(s1, T.f64Bytes(new Float64Array([1, 2, 3, 4 + 1e-12])), 1e-9)
    && !T.scoresAgree(s1, T.f64Bytes(new Float64Array([1, 2, 3, 4.001])), 1e-9));
  const texts = (t: string[]) => new TextEncoder().encode(JSON.stringify({ texts: t }));
  check("complete answers agree on a long shared prefix, not on an early split", prefixAgree(texts(["The fly lands on the sugar and eats it all."]), texts(["The fly lands on the sugar and eats it al."]), 0.9)
    && !prefixAgree(texts(["The fly lands on the sugar."]), texts(["The fly flies away from it."]), 0.9));
  const four = ["a fly", "two flies", "three flies", "the sky is blue today"];
  check("with share 0.75, one text of four may split (two GPUs), two may not", prefixAgree(texts(four), texts([...four.slice(0, 3), "the sea"]), 0.9, 0.75)
    && !prefixAgree(texts(four), texts([four[0], four[1], "x", "y"]), 0.9, 0.75));

  // the WebAssembly templates, in the miners' own sandbox
  const seed = new Uint8Array(32);
  const pol = T.wasmFitnessInput(new Float64Array([0.1, 0.5, 8, 1.5, 0]), 77);
  const c1 = (await runWasm(CARTPOLE, pol, seed, 4096)).output;
  const c2 = (await runWasm(CARTPOLE, pol, seed, 4096)).output;
  const bad = T.wasmFitnessScore((await runWasm(CARTPOLE, T.wasmFitnessInput(new Float64Array(5), 77), seed, 4096)).output);
  check("the cart-pole fitness: same 8 bytes twice, a good policy outlasts a blank one", same(c1, c2) && T.wasmFitnessScore(c1) > bad, `${T.wasmFitnessScore(c1)} vs ${bad}`);
  const blob3 = blobs(900, 4);
  const job: T.SgdJob = { run: "x", round: 0, theta: "", shard: "", model: { wasm: "", params: 9 }, steps: 40, batch: 32, lr: 0.5, weight_decay: 0, seed: 5 };
  const lr1 = (await runWasm(LOGREG, T.wasmTrainInput(job, new Float32Array(9), blob3), seed, 9 * 4 + 64)).output;
  const lr2 = (await runWasm(LOGREG, T.wasmTrainInput(job, new Float32Array(9), blob3), seed, 9 * 4 + 64)).output;
  const ans = T.readSgdAnswer(lr1, 9);
  check("the softmax-regression train step: same bytes twice, a weight change and a loss", same(lr1, lr2) && lr1.length === 44 && ans.delta.some((v) => v !== 0) && ans.loss! > 0 && ans.loss! < 1.2,
    `loss ${ans.loss?.toFixed(3)}, acc ${ans.acc?.toFixed(3)}`);
}

// ---- 2. runs on a server ----------------------------------------------------------------------------------------
const RPC = "http://127.0.0.1:8549";
const PORT = 8789;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "test-admin-token";
const DB = join(tmpdir(), `mine-traintest-${process.pid}.db`);
const BLOBS = join(tmpdir(), `mine-traintest-blobs-${process.pid}`);
const WEI = 10n ** 18n;
const anvil = spawn("anvil", ["--port", "8549"], { stdio: ["ignore", "pipe", "ignore"] });
let server: ReturnType<typeof spawn> | null = null;
const PG = await startPg(5536);
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
  const [owner, buyer] = keys.slice(0, 2).map((k) => {
    const sk = Uint8Array.from(Buffer.from(k, "hex"));
    return { key: `0x${k}`, address: checksumAddress(`0x${hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1))).slice(-40)}`) };
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
      ADMIN_TOKEN: ADMIN, TOKEN_ADDRESS: token, CLAIM_CHAIN_ID: "31337", CLAIM_RPC: RPC, PAY_TO: owner.address, MIN_BID: "10", POOL_SHARE: "0.8", HOUSEKEEPING_MS: "1000", MIN_CHECKED: "1",
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
    return { status: res.status, json, text };
  };
  const upload = async (bytes: Uint8Array) => (await (await fetch(`${BASE}/api/blobs`, { method: "POST", body: bytes as BodyInit })).json()).hash as string;
  const pay = async (o: any) => api(`/api/orders/${o.id}/pay`, { tx: await sendTx(buyer.address, token, calldata("transfer(address,uint256)", owner.address, BigInt(o.budget_wei))) });
  const register = async () => (await api("/api/register", {})).json.token as string;
  const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

  // what a miner page does with each training kind (web/open.worker.ts, web/miner.worker.ts)
  const model = loadModel(fileURLToPath(new URL("../../world/public/connectome/", import.meta.url)));
  const fx = fixedFrom(model.w.lut, model.meta.params);
  const order = recordSets(model, ["descending", "wing"]).flatMap((set) => Array.from(set));
  const columnsOf = (types: string[], side?: "L" | "R") => {
    const want = new Set(cells(model.meta, types, side));
    return order.flatMap((n, k) => (want.has(n) ? [k] : []));
  };
  const answer = async (j: any, lie = false) => {
    let bytes: Uint8Array;
    try {
      const url = BASE + j.params.input_url;
      if (j.kind === "es") bytes = await runEs(BASE, j.params.input);
      else if (j.kind === "sgd") bytes = await runSgd(BASE, j.params.input);
      else if (j.kind === "esb") bytes = await runBrainEs(BASE, j.params.input, (p) => runProbe(model, fx, p as never), columnsOf);
      else throw new Error(`no runner for ${j.kind} (${url})`);
    } catch (err) {
      return { error: String(err instanceof Error ? err.message : err) };
    }
    if (lie) bytes = T.f64Bytes(T.readF64(bytes).map((v) => v + 50)); // claims every perturbation scored far better
    return { output: b64(bytes) };
  };
  /** Miners claim and answer until the run is done (or `ms` pass). */
  const drive = async (runId: string, tokens: string[], kinds: string[], ms: number, liar?: string) => {
    const until = Date.now() + ms;
    for (;;) {
      const view = (await api(`/api/runs/${runId}`)).json;
      if (view.status !== "running" && view.status !== "waiting") return view;
      if (Date.now() > until) return view;
      let worked = false;
      for (const t of [...(liar ? [liar] : []), ...tokens]) {
        const jobs = (await api("/api/claim", { count: 8, kinds, open_max: 8 }, t)).json?.jobs ?? [];
        for (const j of jobs) {
          worked = true;
          await api("/api/submit", { job: j.job, result: await answer(j, t === liar) }, t);
        }
      }
      if (!worked) await sleep(150);
    }
  };

  // refusals
  check("a run that's too big for the server's step is refused", (await api("/api/orders/quote", { spec: { kind: "evolve", dim: 100_000, pairs: 2000, fitness: { builtin: "sphere" } } })).status === 400);
  check("an unknown fitness is refused", (await api("/api/orders/quote", { spec: { kind: "evolve", dim: 3, fitness: { builtin: "moon" } } })).status === 400);
  const q = (await api("/api/orders/quote", { bid: "20", spec: { kind: "evolve", dim: 4, pairs: 8, pairs_per_job: 4, generations: 6, sigma: 0.3, lr: 0.3, timeout_s: 30, fitness: { builtin: "sphere", target: [1, 2, -1, 0.5] } } })).json;
  check("a quote prices the whole run: generations x (center + pair jobs)", q?.jobs === 6 * 3 && q.run.jobs_per_step === 3 && q.full_cost === "360", JSON.stringify(q?.run ?? q));

  // a paid evolve run, two honest miners and a liar
  const ord = (await api("/api/orders", { wallet: buyer.address, bid: "20", budget: "400", spec: q.spec })).json;
  check("a run is created as an order with a run attached, unpaid", ord?.status === "unpaid" && ord.kind === "es" && ord.run?.status === "waiting" && ord.jobs === 3, JSON.stringify(ord?.error ?? ord?.run));
  check("it starts when paid", (await pay(ord)).json?.status === "live");
  const [ma, mb, liar] = [await register(), await register(), await register()];
  const oldClient = (await api("/api/claim", { count: 8 }, await register())).json?.jobs ?? [];
  check("old clients are never handed training jobs", oldClient.every((j: any) => j.kind === "connectome"));
  const t0 = Date.now();
  const done = await drive(ord.run.id, [ma, mb], ["es"], 60_000, liar);
  const pts = done.points as any[];
  check("the run goes generation by generation to its last, on its own", done.status === "done" && done.step === 6 && pts.length === 6 && pts.every((p, i) => p.step === i), `${done.status} at ${done.step} in ${Date.now() - t0} ms`);
  check("its center score climbs toward the target", pts[5].center > pts[0].center && pts[0].center === -(1 + 4 + 1 + 0.25), pts.map((p) => p.center.toFixed(2)).join(" "));
  const theta = T.readF64(new Uint8Array(await (await fetch(BASE + done.theta.url)).arrayBuffer()));
  check("the final parameters download as float64", theta.length === 4 && done.best?.score >= pts[0].center, Array.from(theta, (v) => v.toFixed(2)).join(","));
  const db = new DatabaseSync(DB);
  const lies = db.prepare(`select a.status, count(*) as n from assignments a join tasks t on t.id = a.task where t.kind = 'es' group by a.status`).all() as { status: string; n: number }[];
  db.close();
  const fin = (await api(`/api/orders/${ord.id}`)).json;
  check("the order closes when the run ends: 18 jobs charged, the rest returned", fin.status === "done" && fin.end_reason === "run" && fin.settled === 18 && fin.spent === "360" && fin.returned !== null, JSON.stringify({ s: fin.status, r: fin.end_reason, settled: fin.settled, spent: fin.spent }));
  check("the liar's scores never settle anything", lies.some((l) => l.status === "expired"), JSON.stringify(lies));
  check("a run's jobs can't be added by hand, even with the order key", (await api(`/api/orders/${ord.id}/jobs`, { count: 1 }, ord.order_key)).status === 409);

  // a house train run: the MLP on two spirals, eval on a held-out shard
  const shards = await Promise.all([1, 2, 3, 4].map((s) => upload(spirals(400, s))));
  const evalShard = await upload(spirals(600, 99));
  const badShape = await api("/api/admin/house", { label: "train/bad", spec: { kind: "train", model: { mlp: { layers: [3, 8, 2] } }, shards } }, ADMIN);
  check("a shard that doesn't fit the model is refused", badShape.status === 400 && /inputs/.test(badShape.json?.error), badShape.json?.error);
  const tr = (await api("/api/admin/house", { label: "train/spirals", spec: { kind: "train", model: { mlp: { layers: [2, 24, 24, 2] } }, shards, eval_shard: evalShard, rounds: 12, shards_per_round: 2, local_steps: 25, batch: 32, lr: 0.01 } }, ADMIN)).json;
  check("a house train run starts at once", tr?.status === "live" && tr.kind === "sgd" && tr.run?.id, JSON.stringify(tr?.error ?? tr?.run));
  const trDone = await drive(tr.run.id, [ma, mb], ["sgd"], 90_000);
  const tp = trDone.points as any[];
  check("the MLP trains round by round across miners: held-out accuracy climbs", trDone.status === "done" && tp.length === 12 && tp[11].eval_acc > 0.85 && tp[0].eval_acc < tp[11].eval_acc,
    `${trDone.status} · eval acc ${tp.map((p) => p.eval_acc?.toFixed(2)).join(" ")}`);

  // a house train run with the buyer-style WebAssembly train step (softmax regression)
  const lrShards = await Promise.all([5, 6].map((s) => upload(blobs(600, s))));
  const lrWasm = await upload(LOGREG);
  const theta0 = await upload(T.f32Bytes(new Float32Array(9)));
  const lrRun = (await api("/api/admin/house", { label: "train/logreg-wasm", spec: { kind: "train", model: { wasm: lrWasm, params: 9 }, theta0, shards: lrShards, rounds: 4, shards_per_round: 2, local_steps: 30, batch: 32, lr: 0.5 } }, ADMIN)).json;
  const lrDone = await drive(lrRun.run.id, [ma, mb], ["sgd"], 60_000);
  const lp = lrDone.points as any[];
  check("a WebAssembly train step trains too: its loss falls", lrDone.status === "done" && lp.length === 4 && lp[3].train_loss < lp[0].train_loss, `${lrDone.status} · loss ${lp.map((p) => p.train_loss?.toFixed(3)).join(" ")}`);

  // a house evolve run with the cart-pole WebAssembly fitness
  const cart = await upload(CARTPOLE);
  const cp = (await api("/api/admin/house", { label: "evolve/cartpole", spec: { kind: "evolve", dim: 5, pairs: 16, pairs_per_job: 8, generations: 8, sigma: 0.5, lr: 0.3, episodes: 2, fitness: { wasm: cart } } }, ADMIN)).json;
  const cpDone = await drive(cp.run.id, [ma, mb], ["es"], 60_000);
  const cpp = cpDone.points as any[];
  check("a WebAssembly fitness evolves a cart-pole policy", cpDone.status === "done" && cpp.length === 8 && Math.max(...cpp.map((p) => p.max)) > cpp[0].center, `${cpDone.status} · center ${cpp.map((p) => p.center.toFixed(0)).join(" ")}`);

  // a house brain run: drive two input groups so DNp01 (the giant fiber, escape) fires and little else does
  const br = (await api("/api/admin/house", { label: "evolve/brain-escape", spec: { kind: "evolve", dim: 2, pairs: 2, pairs_per_job: 2, generations: 2, sigma: 0.3, lr: 0.2,
    fitness: { builtin: "brain", steps: 40, inputs: [{ types: ["LC4"] }, { types: ["LPLC2"] }], targets: [{ types: ["DNp01"], weight: 1 }], cost: 0.5 } } }, ADMIN)).json;
  check("a brain fitness runs as its own kind (CPU threads with the connectome)", br?.kind === "esb", JSON.stringify(br?.error ?? br?.kind));
  const t1 = Date.now();
  const brDone = await drive(br.run.id, [ma, mb], ["esb"], 120_000);
  check("the integer brain scores the members and the run finishes", brDone.status === "done" && brDone.points.length === 2 && typeof brDone.points[0].center === "number", `${brDone.status} in ${Date.now() - t1} ms · ${JSON.stringify(brDone.points.map((p: any) => p.center))}`);
  const runs = (await api("/api/runs")).json.runs;
  check("/api/runs lists our own runs, not buyers'", runs.length === 4 && runs.every((r: any) => r.label) && !runs.some((r: any) => r.id === ord.run.id), String(runs.length));
  const curve = (await api(`/api/runs/${tr.run.id}/points?after=5`)).json.points;
  check("the whole curve pages by step", curve.length === 6 && curve[0].step === 6);

  // text completion: prompts in, texts out, settled by prefix agreement
  const prompts = await upload(new TextEncoder().encode(JSON.stringify(["Name a fly.", { system: "Answer in one word.", prompt: "Colour of the sky?" }])));
  check("a complete input that isn't prompts is refused", (await api("/api/admin/house", { label: "complete/bad", spec: { kind: "complete", model: "qwen2.5-0.5b", inputs: [await upload(new TextEncoder().encode("{}"))] } }, ADMIN)).status === 400);
  const co = (await api("/api/admin/house", { label: "complete/test", spec: { kind: "complete", model: "qwen2.5-0.5b", inputs: [prompts, prompts], max_tokens: 64 } }, ADMIN)).json;
  check("a complete order starts", co?.status === "live" && co.kind === "complete", JSON.stringify(co?.error ?? co?.kind));
  const job = (t: string) => api("/api/claim", { count: 4, kinds: ["complete"], open_max: 4 }, t).then((r) => r.json?.jobs ?? []);
  const ja = await job(ma);
  check("complete jobs carry the WebLLM model and the token limit", ja.length >= 1 && ja[0].params.webllm === "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" && ja[0].params.max_tokens === 64, JSON.stringify(ja[0]?.params));
  const say = (t: string[]) => ({ output: b64(new TextEncoder().encode(JSON.stringify({ texts: t }))) });
  check("a complete job can't answer with an error", (await api("/api/submit", { job: ja[0].job, result: { error: "out of memory" } }, ma)).status === 400);
  for (const j of ja) await api("/api/submit", { job: j.job, result: say(["Musca domestica, the common house fly.", "Blue"]) }, ma);
  for (const j of await job(mb)) await api("/api/submit", { job: j.job, result: say(["Musca domestica, the common house fly", "Blue"]) }, mb);
  const cres = (await api(`/api/orders/${co.id}/results`)).json;
  check("two GPUs that differ only at the very end agree", cres.rows.length >= 1 && cres.rows.every((r: any) => r.checked_by === "agreement"), JSON.stringify(cres.rows.map((r: any) => r.checked_by)));
} finally {
  server?.kill();
  anvil.kill();
  await PG.stop();
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB + suffix, { force: true });
  rmSync(BLOBS, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} failed` : "\nall ok");
process.exit(failed ? 1 : 0);
