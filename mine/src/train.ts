/**
 * Training on the fleet (mine/TRAIN-PLAN.md): runs that go generation by generation, where every generation is a
 * batch of ordinary program jobs settled by miners agreeing, and the server takes the step between them.
 *
 *   evolve  evolution strategies (OpenAI ES with antithetic pairs, centered ranks and Adam). A job scores a few
 *           perturbations theta +- sigma * eps and returns only the scores, 16 bytes a pair; the server rebuilds every
 *           eps from its seed, so no weights travel back. Job kind "es" (fitness: builtins, a trading-rule replay or
 *           the buyer's WebAssembly) or "esb" (fitness: the integer fly brain, on CPU threads that hold the connectome).
 *   train   gradient steps on small neural nets, DiLoCo style: a job takes K local Adam steps from the round's
 *           checkpoint on one data shard and returns the weight change; the server averages the changes (the outer
 *           step, Nesterov momentum). Job kind "sgd": the built-in MLP, or the buyer's WebAssembly train step.
 *
 * Everything a miner computes here is deterministic: the noise is built from 32-bit integer hashing and exact float
 * sums (no Math.random, no Math.log), so two honest miners return the same scores bit for bit wherever the fitness
 * itself is exact (WebAssembly, the integer brain, the sphere); the rest agree within a relative tolerance.
 *
 * No DOM and no Node APIs: the server, the miners' workers and the tests all import this file.
 */

// ---- limits ------------------------------------------------------------------------------------------------------
export const RUN_LIMITS = {
  /** parameters an evolve run may have */
  evolveDim: 100_000,
  /** pairs in one generation */
  pairs: 2000,
  /** pairs one job scores */
  pairsPerJob: 64,
  generations: 10_000,
  episodes: 16,
  /** dim x pairs per generation: the server's step has to stay a fraction of a second */
  stepCost: 20_000_000,
  /** parameters a train run's model may have (f32): an answer (4 bytes each) must fit MAX_OUTPUT_BYTES */
  trainDim: 1_000_000,
  rounds: 5000,
  shardsPerRound: 256,
  localSteps: 2000,
  batch: 1024,
  /** rows x params the server spends on one evaluation */
  evalCost: 60_000_000,
  /** layers of the built-in MLP, and widths */
  layers: 8,
  width: 4096,
} as const;

export class RunSpecError extends Error {}

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isSafeInteger(v) && (v as number) >= lo && (v as number) <= hi;
function int(v: unknown, name: string, lo: number, hi: number): number {
  if (!isInt(v, lo, hi)) throw new RunSpecError(`${name} must be a whole number from ${lo} to ${hi}`);
  return v;
}
function num(v: unknown, name: string, lo: number, hi: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) throw new RunSpecError(`${name} must be a number from ${lo} to ${hi}`);
  return v;
}
const HASH = /^[0-9a-f]{64}$/;
const hash = (v: unknown, name: string): string => {
  if (typeof v !== "string" || !HASH.test(v)) throw new RunSpecError(`${name} is the sha256 of an upload (POST /api/blobs)`);
  return v;
};

// ---- integer hashing and noise -----------------------------------------------------------------------------------
/** A 32-bit avalanche of two words (murmur3's finalizer over a combined word). */
export function mix32(a: number, b: number): number {
  let h = (Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** A run's seed from its id, so equal specs in different runs still explore differently. */
export function runSeedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = mix32(h, id.charCodeAt(i));
  return h || 1;
}

/** The seed of pair `i` of generation `gen`: never 0, which means "no noise" (the generation's center). */
export const pairSeed = (runSeed: number, gen: number, i: number): number => mix32(mix32(runSeed, gen + 1), i + 1) || 1;
/** The fitness episode `e` of generation `gen`: the same episodes for every member of a generation (less noise). */
export const episodeSeed = (runSeed: number, gen: number, e: number): number => mix32(mix32(runSeed ^ 0x5bd1e995, gen + 1), e + 1);

const SQRT3 = 1.7320508075688772;
const U32 = 4294967296;

/**
 * Unit-variance noise from a seed: each value is (sum of 4 uniforms - 2) * sqrt(3), an Irwin-Hall draw. Every step
 * is exact in a double (32-bit uniforms, sums of 4 of them, one multiply), so all engines give the same bits.
 */
export function noiseInto(seed: number, out: Float64Array): Float64Array {
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      sum += ((t ^ (t >>> 14)) >>> 0) / U32;
    }
    out[i] = (sum - 2) * SQRT3;
  }
  return out;
}

/** theta + sign * sigma * eps, or theta itself for the center (seed 0). */
export function perturb(theta: Float64Array, seed: number, sigma: number, sign: 1 | -1, eps = new Float64Array(theta.length)): Float64Array {
  const out = new Float64Array(theta.length);
  if (seed === 0) {
    out.set(theta);
    return out;
  }
  noiseInto(seed, eps);
  for (let i = 0; i < theta.length; i++) out[i] = theta[i] + sign * sigma * eps[i];
  return out;
}

/** A deterministic generator for minibatches and init: mulberry32. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / U32;
  };
}

// ---- bytes -------------------------------------------------------------------------------------------------------
export const f64Bytes = (x: Float64Array): Uint8Array => new Uint8Array(x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength));
export const f32Bytes = (x: Float32Array): Uint8Array => new Uint8Array(x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength));
export function readF64(b: Uint8Array): Float64Array {
  if (b.length % 8) throw new RunSpecError("a float64 vector's size is a multiple of 8 bytes");
  return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}
export function readF32(b: Uint8Array): Float32Array {
  if (b.length % 4) throw new RunSpecError("a float32 vector's size is a multiple of 4 bytes");
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}
const utf8 = (s: string) => new TextEncoder().encode(s);

// ---- data shards -------------------------------------------------------------------------------------------------
/**
 * A train run's data, one upload per shard:
 *   "FLYDATA1" | u32 rows | u32 x_dim | u32 y_kind (0 = class labels, 1 = float targets) | u32 y_dim (classes, or
 *   targets per row) | f32 x[rows * x_dim] | y: u32[rows] labels, or f32[rows * y_dim]
 * All little-endian. The Python client (mine/python) writes these from numpy arrays.
 */
export const SHARD_MAGIC = "FLYDATA1";
export interface Shard { rows: number; xDim: number; yKind: 0 | 1; yDim: number; x: Float32Array; labels: Uint32Array | null; y: Float32Array | null }

export function encodeShard(s: { x: Float32Array; xDim: number; labels?: Uint32Array; classes?: number; y?: Float32Array; yDim?: number }): Uint8Array {
  const rows = s.x.length / s.xDim;
  if (!Number.isInteger(rows)) throw new RunSpecError("x's length is rows x x_dim");
  const yKind = s.labels ? 0 : 1;
  const yDim = s.labels ? s.classes! : s.yDim!;
  const yBytes = s.labels ? rows * 4 : rows * yDim * 4;
  const out = new Uint8Array(24 + rows * s.xDim * 4 + yBytes);
  out.set(utf8(SHARD_MAGIC), 0);
  const v = new DataView(out.buffer);
  v.setUint32(8, rows, true);
  v.setUint32(12, s.xDim, true);
  v.setUint32(16, yKind, true);
  v.setUint32(20, yDim, true);
  out.set(new Uint8Array(s.x.buffer, s.x.byteOffset, s.x.byteLength), 24);
  const y = s.labels ?? s.y!;
  out.set(new Uint8Array(y.buffer, y.byteOffset, y.byteLength), 24 + rows * s.xDim * 4);
  return out;
}

export function decodeShard(b: Uint8Array): Shard {
  if (b.length < 24 || new TextDecoder().decode(b.subarray(0, 8)) !== SHARD_MAGIC) throw new RunSpecError(`a data shard starts with ${SHARD_MAGIC}`);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const rows = v.getUint32(8, true);
  const xDim = v.getUint32(12, true);
  const yKind = v.getUint32(16, true);
  const yDim = v.getUint32(20, true);
  if (yKind !== 0 && yKind !== 1) throw new RunSpecError("y_kind is 0 (class labels) or 1 (float targets)");
  if (!rows || !xDim || !yDim) throw new RunSpecError("a shard has rows, x_dim and y_dim");
  const xEnd = 24 + rows * xDim * 4;
  const want = xEnd + (yKind === 0 ? rows * 4 : rows * yDim * 4);
  if (b.length !== want) throw new RunSpecError(`the shard is ${b.length} bytes; its header says ${want}`);
  const x = new Float32Array(b.buffer.slice(b.byteOffset + 24, b.byteOffset + xEnd));
  const tail = b.buffer.slice(b.byteOffset + xEnd, b.byteOffset + want);
  const labels = yKind === 0 ? new Uint32Array(tail) : null;
  if (labels) for (const l of labels) if (l >= yDim) throw new RunSpecError(`a label is ${l}; the shard has ${yDim} classes`);
  return { rows, xDim, yKind: yKind as 0 | 1, yDim, x, labels, y: yKind === 1 ? new Float32Array(tail) : null };
}

/** Just the header, for checking shards at order time without decoding every float. */
export function shardHeader(b: Uint8Array): { rows: number; xDim: number; yKind: number; yDim: number } {
  if (b.length < 24 || new TextDecoder().decode(b.subarray(0, 8)) !== SHARD_MAGIC) throw new RunSpecError(`a data shard starts with ${SHARD_MAGIC}`);
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { rows: v.getUint32(8, true), xDim: v.getUint32(12, true), yKind: v.getUint32(16, true), yDim: v.getUint32(20, true) };
}

// ---- the built-in MLP --------------------------------------------------------------------------------------------
/**
 * Dense layers [in, h1, ..., out] with ReLU between them (tanh optional), softmax cross-entropy for labels or mean
 * squared error for float targets. Parameters, flattened: for each layer, W (out x in, row-major) then b (out).
 */
export interface MlpSpec { layers: number[]; activation: "relu" | "tanh"; loss: "xent" | "mse" }

export function mlpParams(m: MlpSpec): number {
  let n = 0;
  for (let l = 1; l < m.layers.length; l++) n += m.layers[l] * m.layers[l - 1] + m.layers[l];
  return n;
}

/** He (ReLU) or Xavier (tanh) init from a seed, biases 0. Uniform with the matching variance: exact, no Math.log. */
export function mlpInit(m: MlpSpec, seed: number): Float32Array {
  const theta = new Float32Array(mlpParams(m));
  const r = rng(seed);
  let at = 0;
  for (let l = 1; l < m.layers.length; l++) {
    const fanIn = m.layers[l - 1];
    const limit = Math.sqrt((m.activation === "relu" ? 6 : 3) / fanIn);
    for (let k = 0; k < m.layers[l] * fanIn; k++) theta[at++] = (r() * 2 - 1) * limit;
    at += m.layers[l];
  }
  return theta;
}

interface Pass { acts: Float64Array[]; pre: Float64Array[] }

function forward(m: MlpSpec, theta: Float32Array | Float64Array, x: Float32Array, row: number, pass: Pass): Float64Array {
  const L = m.layers;
  const a0 = pass.acts[0];
  for (let i = 0; i < L[0]; i++) a0[i] = x[row * L[0] + i];
  let at = 0;
  for (let l = 1; l < L.length; l++) {
    const inp = pass.acts[l - 1];
    const pre = pass.pre[l];
    const act = pass.acts[l];
    const nIn = L[l - 1];
    const nOut = L[l];
    const bAt = at + nOut * nIn;
    for (let o = 0; o < nOut; o++) {
      let s = theta[bAt + o];
      const w = at + o * nIn;
      for (let i = 0; i < nIn; i++) s += theta[w + i] * inp[i];
      pre[o] = s;
      act[o] = l === L.length - 1 ? s : m.activation === "relu" ? (s > 0 ? s : 0) : Math.tanh(s);
    }
    at = bAt + nOut;
  }
  return pass.acts[L.length - 1];
}

function newPass(m: MlpSpec): Pass {
  return { acts: m.layers.map((n) => new Float64Array(n)), pre: m.layers.map((n) => new Float64Array(n)) };
}

/** Loss of one row and the output layer's gradient in `g` (d loss / d pre-activation). */
function lossGrad(m: MlpSpec, out: Float64Array, shard: Shard, row: number, g: Float64Array): { loss: number; hit: number } {
  if (m.loss === "xent") {
    const label = shard.labels![row];
    let max = -Infinity;
    for (let k = 0; k < out.length; k++) if (out[k] > max) max = out[k];
    let z = 0;
    for (let k = 0; k < out.length; k++) z += Math.exp(out[k] - max);
    let best = 0;
    for (let k = 0; k < out.length; k++) {
      g[k] = Math.exp(out[k] - max) / z - (k === label ? 1 : 0);
      if (out[k] > out[best]) best = k;
    }
    return { loss: -(out[label] - max - Math.log(z)), hit: best === label ? 1 : 0 };
  }
  let loss = 0;
  for (let k = 0; k < out.length; k++) {
    const d = out[k] - shard.y![row * out.length + k];
    g[k] = (2 * d) / out.length;
    loss += (d * d) / out.length;
  }
  return { loss, hit: 0 };
}

/** Back through the layers from the output gradient, adding into `grad`. */
function backward(m: MlpSpec, theta: Float32Array | Float64Array, pass: Pass, gOut: Float64Array, grad: Float64Array, deltas: Float64Array[]): void {
  const L = m.layers;
  const offsets: number[] = [];
  let at = 0;
  for (let l = 1; l < L.length; l++) {
    offsets[l] = at;
    at += L[l] * L[l - 1] + L[l];
  }
  deltas[L.length - 1].set(gOut);
  for (let l = L.length - 1; l >= 1; l--) {
    const d = deltas[l];
    const nIn = L[l - 1];
    const nOut = L[l];
    const w0 = offsets[l];
    const b0 = w0 + nOut * nIn;
    const inp = pass.acts[l - 1];
    for (let o = 0; o < nOut; o++) {
      const dv = d[o];
      if (dv === 0) continue;
      grad[b0 + o] += dv;
      const w = w0 + o * nIn;
      for (let i = 0; i < nIn; i++) grad[w + i] += dv * inp[i];
    }
    if (l > 1) {
      const prev = deltas[l - 1];
      prev.fill(0);
      for (let o = 0; o < nOut; o++) {
        const dv = d[o];
        if (dv === 0) continue;
        const w = w0 + o * nIn;
        for (let i = 0; i < nIn; i++) prev[i] += dv * theta[w + i];
      }
      const pre = pass.pre[l - 1];
      for (let i = 0; i < nIn; i++) {
        if (m.activation === "relu") { if (pre[i] <= 0) prev[i] = 0; }
        else { const t = pass.acts[l - 1][i]; prev[i] *= 1 - t * t; }
      }
    }
  }
}

export interface LocalTrain { steps: number; batch: number; lr: number; seed: number; weight_decay: number }

/**
 * K local AdamW steps from theta on one shard, minibatches drawn with the job's seed. Returns the change in the
 * weights (new - old) and the mean loss and accuracy over the steps' batches.
 */
export function mlpTrain(m: MlpSpec, theta0: Float32Array, shard: Shard, t: LocalTrain): { delta: Float32Array; loss: number; acc: number } {
  checkShardFits(m, shard);
  const P = theta0.length;
  const theta = Float64Array.from(theta0);
  const grad = new Float64Array(P);
  const mom = new Float64Array(P);
  const vel = new Float64Array(P);
  const pass = newPass(m);
  const deltas = m.layers.map((n) => new Float64Array(n));
  const gOut = new Float64Array(m.layers[m.layers.length - 1]);
  const r = rng(t.seed);
  const b1 = 0.9;
  const b2 = 0.999;
  let lossSum = 0;
  let hits = 0;
  let seen = 0;
  for (let step = 1; step <= t.steps; step++) {
    grad.fill(0);
    const batch = Math.min(t.batch, shard.rows);
    for (let k = 0; k < batch; k++) {
      const row = Math.floor(r() * shard.rows);
      const out = forward(m, theta, shard.x, row, pass);
      const { loss, hit } = lossGrad(m, out, shard, row, gOut);
      lossSum += loss;
      hits += hit;
      seen++;
      backward(m, theta, pass, gOut, grad, deltas);
    }
    const c1 = 1 - b1 ** step;
    const c2 = 1 - b2 ** step;
    for (let i = 0; i < P; i++) {
      const g = grad[i] / batch;
      mom[i] = b1 * mom[i] + (1 - b1) * g;
      vel[i] = b2 * vel[i] + (1 - b2) * g * g;
      theta[i] -= t.lr * ((mom[i] / c1) / (Math.sqrt(vel[i] / c2) + 1e-8) + t.weight_decay * theta[i]);
    }
  }
  const delta = new Float32Array(P);
  for (let i = 0; i < P; i++) delta[i] = theta[i] - theta0[i];
  return { delta, loss: seen ? lossSum / seen : 0, acc: m.loss === "xent" && seen ? hits / seen : 0 };
}

/** Loss and accuracy of theta on (up to `maxRows` of) a shard, rows taken evenly. */
export function mlpEval(m: MlpSpec, theta: Float32Array, shard: Shard, maxRows = shard.rows): { loss: number; acc: number; rows: number } {
  checkShardFits(m, shard);
  const pass = newPass(m);
  const g = new Float64Array(m.layers[m.layers.length - 1]);
  const n = Math.max(1, Math.min(shard.rows, maxRows));
  let loss = 0;
  let hits = 0;
  for (let k = 0; k < n; k++) {
    const row = Math.floor((k * shard.rows) / n);
    const r = lossGrad(m, forward(m, theta, shard.x, row, pass), shard, row, g);
    loss += r.loss;
    hits += r.hit;
  }
  return { loss: loss / n, acc: m.loss === "xent" ? hits / n : 0, rows: n };
}

function checkShardFits(m: MlpSpec, s: Shard): void {
  if (s.xDim !== m.layers[0]) throw new RunSpecError(`the shard's rows have ${s.xDim} inputs; the model takes ${m.layers[0]}`);
  const out = m.layers[m.layers.length - 1];
  if (m.loss === "xent" && (s.yKind !== 0 || s.yDim !== out)) throw new RunSpecError(`cross-entropy needs class labels for ${out} classes`);
  if (m.loss === "mse" && (s.yKind !== 1 || s.yDim !== out)) throw new RunSpecError(`mse needs ${out} float targets a row`);
}

// ---- fitness ----------------------------------------------------------------------------------------------------
/** A brain fitness: stimulus amounts are the parameters, the score adds weighted spike counts of named cells. */
export interface BrainFitness {
  builtin: "brain";
  /** one parameter per input group: its voltage per step while on (clamped to -2..2) */
  inputs: { types?: string[]; prefixes?: string[]; side?: "L" | "R"; from?: number; to?: number }[];
  /** score = sum of weight x spikes of each target's cells over [from, to), all recorded descending/wing cells */
  targets: { types: string[]; side?: "L" | "R"; weight: number; from?: number; to?: number }[];
  steps: number;
  gain: number;
  tonic: number;
  /** subtracted per unit of |amount|, so the search prefers small drives */
  cost: number;
}
export interface ReplayFitness {
  builtin: "replay";
  data: string;
  /** the setting the parameters go into: fee, usd, every, rule */
  setting: { name?: string; fee?: number; usd?: number; every?: number; rule: Record<string, unknown> };
  /** which rule numbers the parameters are, each squashed into [lo, hi] (theta 0 = the middle); int rounds it */
  keys: { path: string; lo: number; hi: number; int?: boolean }[];
  /** reshuffled price paths per score (the generation's episodes); 0 = the recorded path only */
  block: number;
}
export type Fitness =
  | { builtin: "sphere" | "rastrigin"; target?: number[] }
  | BrainFitness
  | ReplayFitness
  | { wasm: string };

/** Maps an unbounded parameter into [lo, hi] with a smooth squash that is exact to compute: x / (1 + |x|). */
export const squash = (x: number, lo: number, hi: number): number => lo + ((hi - lo) * (1 + x / (1 + Math.abs(x)))) / 2;

/** The rule a replay fitness scores, parameters filled in. */
export function replaySettingFor(f: ReplayFitness, theta: Float64Array): { name: string; fee: number; usd: number; every: number; rule: Record<string, unknown> } {
  const rule = JSON.parse(JSON.stringify(f.setting.rule));
  f.keys.forEach((k, i) => {
    let v = squash(theta[i], k.lo, k.hi);
    if (k.int) v = Math.round(v);
    const parts = k.path.split(".");
    let o = rule;
    for (const p of parts.slice(0, -1)) o = o[p] ??= {};
    o[parts[parts.length - 1]] = v;
  });
  return { name: f.setting.name ?? "evolve", fee: f.setting.fee ?? 0.003, usd: f.setting.usd ?? 2500, every: f.setting.every ?? 64, rule };
}

/** The sphere and Rastrigin functions, as scores to maximize (0 at the target is the best). */
export function builtinScore(f: { builtin: "sphere" | "rastrigin"; target?: number[] }, x: Float64Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    const d = x[i] - (f.target?.[i] ?? 0);
    s += f.builtin === "sphere" ? d * d : d * d - 10 * Math.cos(2 * Math.PI * d) + 10;
  }
  return -s;
}

// ---- run specs ---------------------------------------------------------------------------------------------------
export interface EvolveRun {
  kind: "evolve";
  fitness: Fitness;
  dim: number;
  /** sha256 of the starting theta (f64 LE), or null for zeros */
  theta0: string | null;
  sigma: number;
  lr: number;
  pairs: number;
  pairs_per_job: number;
  generations: number;
  episodes: number;
  weight_decay: number;
  timeout_s: number;
  redundancy: number;
}

export interface TrainRun {
  kind: "train";
  model: { mlp: MlpSpec } | { wasm: string; params: number };
  /** sha256 of the starting weights (f32 LE), or null: the MLP's seeded init (a wasm model needs theta0) */
  theta0: string | null;
  shards: string[];
  eval_shard: string | null;
  rounds: number;
  shards_per_round: number;
  local_steps: number;
  batch: number;
  lr: number;
  weight_decay: number;
  outer_lr: number;
  outer_momentum: number;
  timeout_s: number;
  redundancy: number;
  /** the lowest cosine at which two miners' weight changes still agree */
  cosine: number;
}

export type RunSpec = EvolveRun | TrainRun;
export const isRunKind = (k: unknown): k is "evolve" | "train" => k === "evolve" || k === "train";

function fitnessSpec(f: any, dim: number): Fitness {
  if (!f || typeof f !== "object") throw new RunSpecError('fitness is {"builtin": "sphere" | "rastrigin" | "brain" | "replay", ...} or {"wasm": "<sha256>"}');
  if (f.wasm !== undefined) return { wasm: hash(f.wasm, "fitness.wasm") };
  if (f.builtin === "sphere" || f.builtin === "rastrigin") {
    if (f.target !== undefined && (!Array.isArray(f.target) || f.target.length !== dim || f.target.some((x: unknown) => typeof x !== "number" || !Number.isFinite(x)))) {
      throw new RunSpecError(`fitness.target is ${dim} numbers`);
    }
    return { builtin: f.builtin, ...(f.target ? { target: f.target } : {}) };
  }
  if (f.builtin === "brain") {
    const steps = int(f.steps ?? 150, "fitness.steps", 10, 600);
    const window = (x: any, what: string) => {
      const from = int(x.from ?? 0, `${what}.from`, 0, steps);
      return { from, to: int(x.to ?? steps, `${what}.to`, from, steps) };
    };
    const names = (x: any, what: string, need: boolean) => {
      const types = x.types ?? [];
      const prefixes = x.prefixes ?? [];
      if (!Array.isArray(types) || !Array.isArray(prefixes) || [...types, ...prefixes].some((t: unknown) => typeof t !== "string" || !/^[\w .,:+-]{1,48}$/.test(t))) {
        throw new RunSpecError(`${what}: types and prefixes are lists of cell type names`);
      }
      if (need && !types.length && !prefixes.length) throw new RunSpecError(`${what} needs types or prefixes`);
      return { ...(types.length ? { types } : {}), ...(prefixes.length ? { prefixes } : {}), ...(x.side === "L" || x.side === "R" ? { side: x.side } : {}) };
    };
    if (!Array.isArray(f.inputs) || f.inputs.length !== dim) throw new RunSpecError(`a brain fitness has one input group per parameter: ${dim}`);
    if (!Array.isArray(f.targets) || !f.targets.length || f.targets.length > 32) throw new RunSpecError("fitness.targets is 1..32 cell groups");
    return {
      builtin: "brain", steps,
      inputs: f.inputs.map((x: any, i: number) => ({ ...names(x, `input ${i}`, true), ...window(x, `input ${i}`) })),
      targets: f.targets.map((x: any, i: number) => {
        const n = names(x, `target ${i}`, true);
        if (!n.types) throw new RunSpecError(`target ${i}: types (descending or wing motor cells)`);
        return { ...n, types: n.types, weight: num(x.weight ?? 1, `target ${i}.weight`, -1000, 1000), ...window(x, `target ${i}`) };
      }),
      gain: num(f.gain ?? 3, "fitness.gain", 0.5, 8), tonic: num(f.tonic ?? 0.14, "fitness.tonic", 0, 0.5), cost: num(f.cost ?? 0, "fitness.cost", 0, 1e6),
    };
  }
  if (f.builtin === "replay") {
    if (!f.setting || typeof f.setting.rule !== "object" || typeof f.setting.rule?.strategy !== "string") throw new RunSpecError("fitness.setting.rule is a desk rule with a strategy");
    if (JSON.stringify(f.setting).length > 4000) throw new RunSpecError("fitness.setting is over 4,000 characters");
    if (!Array.isArray(f.keys) || f.keys.length !== dim) throw new RunSpecError(`a replay fitness has one key per parameter: ${dim}`);
    return {
      builtin: "replay", data: hash(f.data, "fitness.data"), block: int(f.block ?? 96, "fitness.block", 0, 100_000),
      setting: {
        ...(typeof f.setting.name === "string" ? { name: f.setting.name.slice(0, 100) } : {}),
        fee: num(f.setting.fee ?? 0.003, "setting.fee", 0, 0.2), usd: num(f.setting.usd ?? 2500, "setting.usd", 10, 1e7),
        every: int(f.setting.every ?? 64, "setting.every", 1, 10_000), rule: f.setting.rule,
      },
      keys: f.keys.map((k: any, i: number) => {
        if (typeof k?.path !== "string" || !/^[\w]+(\.[\w]+)*$/.test(k.path) || k.path === "strategy") throw new RunSpecError(`key ${i}: path is a rule field like hold_bars`);
        const lo = num(k.lo, `key ${i}.lo`, -1e9, 1e9);
        return { path: k.path, lo, hi: num(k.hi, `key ${i}.hi`, lo, 1e9), ...(k.int === true ? { int: true } : {}) };
      }),
    };
  }
  throw new RunSpecError('fitness.builtin is sphere, rastrigin, brain or replay (or give {"wasm": "<sha256>"})');
}

/** An evolve or train spec, checked and with its defaults filled in. */
export function runSpec(spec: any): RunSpec {
  if (!spec || !isRunKind(spec.kind)) throw new RunSpecError('a run is {"kind": "evolve", ...} or {"kind": "train", ...}');
  const timeout = int(spec.timeout_s ?? 120, "timeout_s", 5, 600);
  const redundancy = int(spec.redundancy ?? 2, "redundancy", 1, 5);
  if (spec.kind === "evolve") {
    const dim = int(spec.dim, "dim", 1, RUN_LIMITS.evolveDim);
    const pairs = int(spec.pairs ?? 64, "pairs", 2, RUN_LIMITS.pairs);
    if (dim * pairs > RUN_LIMITS.stepCost) throw new RunSpecError(`dim x pairs is at most ${RUN_LIMITS.stepCost.toLocaleString("en-US")}`);
    const fitness = fitnessSpec(spec.fitness, dim);
    return {
      kind: "evolve", fitness, dim, theta0: spec.theta0 === undefined || spec.theta0 === null ? null : hash(spec.theta0, "theta0"),
      sigma: num(spec.sigma ?? 0.1, "sigma", 1e-6, 100), lr: num(spec.lr ?? 0.05, "lr", 1e-6, 100),
      pairs, pairs_per_job: int(spec.pairs_per_job ?? Math.min(8, pairs), "pairs_per_job", 1, RUN_LIMITS.pairsPerJob),
      generations: int(spec.generations ?? 100, "generations", 1, RUN_LIMITS.generations),
      episodes: int(spec.episodes ?? 1, "episodes", 1, RUN_LIMITS.episodes), weight_decay: num(spec.weight_decay ?? 0, "weight_decay", 0, 1),
      timeout_s: timeout, redundancy,
    };
  }
  let model: TrainRun["model"];
  if (spec.model?.mlp) {
    const m = spec.model.mlp;
    if (!Array.isArray(m.layers) || m.layers.length < 2 || m.layers.length > RUN_LIMITS.layers + 1) throw new RunSpecError(`model.mlp.layers is 2..${RUN_LIMITS.layers + 1} widths, inputs first`);
    const layers = m.layers.map((w: unknown, i: number) => int(w, `layer ${i}`, 1, RUN_LIMITS.width));
    const mlp: MlpSpec = { layers, activation: m.activation === "tanh" ? "tanh" : "relu", loss: m.loss === "mse" ? "mse" : "xent" };
    if (mlpParams(mlp) > RUN_LIMITS.trainDim) throw new RunSpecError(`the model has ${mlpParams(mlp).toLocaleString("en-US")} parameters; the limit is ${RUN_LIMITS.trainDim.toLocaleString("en-US")}`);
    model = { mlp };
  } else if (spec.model?.wasm) {
    model = { wasm: hash(spec.model.wasm, "model.wasm"), params: int(spec.model.params, "model.params", 1, RUN_LIMITS.trainDim) };
    if (!spec.theta0) throw new RunSpecError("a wasm model needs theta0: its starting weights, f32 little-endian");
  } else {
    throw new RunSpecError('model is {"mlp": {"layers": [in, ..., out], "activation"?, "loss"?}} or {"wasm": "<sha256>", "params": n}');
  }
  if (!Array.isArray(spec.shards) || !spec.shards.length || spec.shards.length > 10_000) throw new RunSpecError("shards is 1..10000 data uploads");
  const shards = spec.shards.map((h: unknown, i: number) => hash(h, `shard ${i}`));
  const P = "mlp" in model ? mlpParams(model.mlp) : model.params;
  const perRound = int(spec.shards_per_round ?? Math.min(16, shards.length), "shards_per_round", 1, RUN_LIMITS.shardsPerRound);
  if (P * perRound > 200_000_000) throw new RunSpecError("parameters x shards_per_round is at most 200,000,000");
  return {
    kind: "train", model, theta0: spec.theta0 ? hash(spec.theta0, "theta0") : null, shards,
    eval_shard: spec.eval_shard ? hash(spec.eval_shard, "eval_shard") : null,
    rounds: int(spec.rounds ?? 50, "rounds", 1, RUN_LIMITS.rounds), shards_per_round: perRound,
    local_steps: int(spec.local_steps ?? 50, "local_steps", 1, RUN_LIMITS.localSteps), batch: int(spec.batch ?? 32, "batch", 1, RUN_LIMITS.batch),
    lr: num(spec.lr ?? 1e-3, "lr", 1e-8, 10), weight_decay: num(spec.weight_decay ?? 0, "weight_decay", 0, 1),
    outer_lr: num(spec.outer_lr ?? 0.7, "outer_lr", 0.01, 10), outer_momentum: num(spec.outer_momentum ?? 0.9, "outer_momentum", 0, 0.99),
    timeout_s: timeout, redundancy, cosine: num(spec.cosine ?? 0.999, "cosine", 0.9, 1),
  };
}

export const runParams = (r: RunSpec): number => r.kind === "evolve" ? r.dim : "mlp" in r.model ? mlpParams(r.model.mlp) : r.model.params;
/** Jobs in one generation (evolve: the center job plus the pairs' jobs) or round (train). */
export const jobsPerStep = (r: RunSpec): number => r.kind === "evolve" ? 1 + Math.ceil(r.pairs / r.pairs_per_job) : r.shards_per_round;
export const steps = (r: RunSpec): number => r.kind === "evolve" ? r.generations : r.rounds;
export const totalJobs = (r: RunSpec): number => jobsPerStep(r) * steps(r);
/** The job kind miners run: brain fitness needs the connectome (CPU threads); the rest run in a fresh worker. */
export const jobKindOf = (r: RunSpec): "es" | "esb" | "sgd" => r.kind === "train" ? "sgd" : "builtin" in r.fitness && r.fitness.builtin === "brain" ? "esb" : "es";

// ---- jobs --------------------------------------------------------------------------------------------------------
/** What one es/esb job says: the generation's theta, which pairs, and the episodes every member is scored on. */
export interface EsJob {
  run: string;
  gen: number;
  theta: string;
  dim: number;
  sigma: number;
  /** pair seeds; 0 is the center (theta itself), scored once into both slots */
  seeds: number[];
  episodes: number[];
  fitness: Fitness;
}
export interface SgdJob {
  run: string;
  round: number;
  theta: string;
  shard: string;
  model: TrainRun["model"];
  steps: number;
  batch: number;
  lr: number;
  weight_decay: number;
  seed: number;
}

/** The jobs of generation `gen`: job 0 scores the center, the rest split the pairs. */
export function evolveJobs(runId: string, r: EvolveRun, gen: number, theta: string): EsJob[] {
  const seed = runSeedOf(runId);
  const episodes = Array.from({ length: r.episodes }, (_, e) => episodeSeed(seed, gen, e));
  const jobs: EsJob[] = [{ run: runId, gen, theta, dim: r.dim, sigma: r.sigma, seeds: [0], episodes, fitness: r.fitness }];
  for (let i = 0; i < r.pairs; i += r.pairs_per_job) {
    const seeds = [];
    for (let k = i; k < Math.min(r.pairs, i + r.pairs_per_job); k++) seeds.push(pairSeed(seed, gen, k));
    jobs.push({ run: runId, gen, theta, dim: r.dim, sigma: r.sigma, seeds, episodes, fitness: r.fitness });
  }
  return jobs;
}

/** The jobs of round `round`: shards_per_round shards, walking the list round by round (it wraps around). */
export function trainJobs(runId: string, r: TrainRun, round: number, theta: string): SgdJob[] {
  const seed = runSeedOf(runId);
  return Array.from({ length: r.shards_per_round }, (_, k) => ({
    run: runId, round, theta, shard: r.shards[(round * r.shards_per_round + k) % r.shards.length], model: r.model,
    steps: r.local_steps, batch: r.batch, lr: r.lr, weight_decay: r.weight_decay, seed: mix32(mix32(seed, round + 1), k + 1),
  }));
}

/** An es job's answer: f64 scores, two per seed (+ then -), each the mean over the episodes. */
export async function runEsJob(job: EsJob, theta: Float64Array, score: (x: Float64Array, episode: number) => Promise<number> | number): Promise<Uint8Array> {
  if (theta.length !== job.dim) throw new Error(`theta has ${theta.length} values; the job says ${job.dim}`);
  const out = new Float64Array(job.seeds.length * 2);
  const eps = new Float64Array(job.dim);
  const mean = async (x: Float64Array) => {
    let s = 0;
    for (const e of job.episodes) {
      const v = await score(x, e);
      if (typeof v !== "number" || Number.isNaN(v)) throw new Error("the fitness gave no number");
      s += v;
    }
    return s / job.episodes.length;
  };
  for (let k = 0; k < job.seeds.length; k++) {
    const seed = job.seeds[k];
    out[2 * k] = await mean(perturb(theta, seed, job.sigma, 1, eps));
    out[2 * k + 1] = seed === 0 ? out[2 * k] : await mean(perturb(theta, seed, job.sigma, -1, eps));
  }
  return f64Bytes(out);
}

/** A wasm fitness's input: u32 episode seed, u32 dim, then the parameters as f64 (8-aligned at byte 8). */
export function wasmFitnessInput(x: Float64Array, episode: number): Uint8Array {
  const b = new Uint8Array(8 + x.length * 8);
  const v = new DataView(b.buffer);
  v.setUint32(0, episode >>> 0, true);
  v.setUint32(4, x.length, true);
  b.set(new Uint8Array(x.buffer, x.byteOffset, x.byteLength), 8);
  return b;
}
/** Its answer: the score, the first 8 bytes as an f64. */
export function wasmFitnessScore(out: Uint8Array): number {
  if (out.length < 8) throw new Error("a fitness program outputs its score as 8 bytes (f64 little-endian)");
  return new DataView(out.buffer, out.byteOffset, 8).getFloat64(0, true);
}

/**
 * A wasm train step's input: u32 header length | header JSON {steps, batch, lr, weight_decay, seed, params} |
 * zero padding to a multiple of 4 | theta (f32 x params) | the shard as uploaded. Its output: the weight change
 * (f32 x params), then optional f32 metrics (the first is the mean loss, the second the accuracy).
 */
export function wasmTrainInput(job: SgdJob, theta: Float32Array, shard: Uint8Array): Uint8Array {
  const header = utf8(JSON.stringify({ steps: job.steps, batch: job.batch, lr: job.lr, weight_decay: job.weight_decay, seed: job.seed, params: theta.length }));
  const at = Math.ceil((4 + header.length) / 4) * 4;
  const b = new Uint8Array(at + theta.byteLength + shard.length);
  new DataView(b.buffer).setUint32(0, header.length, true);
  b.set(header, 4);
  b.set(new Uint8Array(theta.buffer, theta.byteOffset, theta.byteLength), at);
  b.set(shard, at + theta.byteLength);
  return b;
}

/** An sgd answer: delta (f32 x P) then [loss, acc] (f32). */
export function sgdAnswer(delta: Float32Array, loss: number, acc: number): Uint8Array {
  const out = new Float32Array(delta.length + 2);
  out.set(delta);
  out[delta.length] = loss;
  out[delta.length + 1] = acc;
  return f32Bytes(out);
}
export function readSgdAnswer(b: Uint8Array, P: number): { delta: Float32Array; loss: number | null; acc: number | null } {
  const all = readF32(b);
  if (all.length < P) throw new Error(`an answer has ${all.length} floats; the model has ${P} parameters`);
  return { delta: all.subarray(0, P), loss: all.length > P ? all[P] : null, acc: all.length > P + 1 ? all[P + 1] : null };
}

/** Whether two weight changes agree: same length, cosine of the deltas at least `min`, metrics within 1e-3. */
export function deltaAgree(a: Uint8Array, b: Uint8Array, P: number, min: number): boolean {
  if (a.length !== b.length || a.length < P * 4) return false;
  const x = readF32(a);
  const y = readF32(b);
  let dot = 0;
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < P; i++) {
    dot += x[i] * y[i];
    nx += x[i] * x[i];
    ny += y[i] * y[i];
  }
  if (nx === 0 && ny === 0) return true;
  if (!(dot / Math.sqrt(nx * ny) >= min)) return false;
  // the norms too: a cosine alone would accept a change scaled by any factor
  if (!(Math.abs(Math.sqrt(nx) - Math.sqrt(ny)) <= 1e-3 * Math.max(Math.sqrt(nx), Math.sqrt(ny)))) return false;
  for (let i = P; i < x.length; i++) if (!(Math.abs(x[i] - y[i]) <= 1e-3 * Math.max(1, Math.abs(x[i])))) return false;
  return true;
}

/** Whether two score vectors agree within a relative tolerance (exact fitness functions give equal bytes anyway). */
export function scoresAgree(a: Uint8Array, b: Uint8Array, rel: number): boolean {
  if (a.length !== b.length || a.length % 8) return false;
  const x = readF64(a);
  const y = readF64(b);
  for (let i = 0; i < x.length; i++) {
    if (Number.isNaN(x[i]) || Number.isNaN(y[i])) return false;
    if (!(Math.abs(x[i] - y[i]) <= rel * Math.max(1, Math.abs(x[i]), Math.abs(y[i])))) return false;
  }
  return true;
}

// ---- the server's steps ------------------------------------------------------------------------------------------
/** Adam state for an evolve run, kept between generations. */
export interface EsState { t: number; m: Float64Array; v: Float64Array }
export const esState = (dim: number): EsState => ({ t: 0, m: new Float64Array(dim), v: new Float64Array(dim) });

/** Centered ranks in [-0.5, 0.5]; ties share their mean rank. */
export function centeredRanks(xs: number[]): number[] {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const ranks = new Array<number>(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]] === xs[idx[i]]) j++;
    for (let k = i; k <= j; k++) ranks[idx[k]] = (i + j) / 2;
    i = j + 1;
  }
  const n = xs.length;
  return ranks.map((r) => (n > 1 ? r / (n - 1) - 0.5 : 0));
}

/**
 * One ES step: from the pairs' scores (seed, f(theta + sigma eps), f(theta - sigma eps)) to the next theta, by
 * Adam ascent on the rank-shaped gradient estimate. Pairs whose job was disputed or failed are simply missing.
 */
export function esStep(r: EvolveRun, theta: Float64Array, state: EsState, pairs: { seed: number; plus: number; minus: number }[]): { theta: Float64Array; gradNorm: number } {
  if (!pairs.length) return { theta, gradNorm: 0 };
  const ranks = centeredRanks(pairs.flatMap((p) => [p.plus, p.minus]));
  const g = new Float64Array(r.dim);
  const eps = new Float64Array(r.dim);
  for (let k = 0; k < pairs.length; k++) {
    const w = ranks[2 * k] - ranks[2 * k + 1];
    if (w === 0) continue;
    noiseInto(pairs[k].seed, eps);
    for (let i = 0; i < r.dim; i++) g[i] += w * eps[i];
  }
  let norm = 0;
  for (let i = 0; i < r.dim; i++) {
    g[i] /= pairs.length * r.sigma;
    norm += g[i] * g[i];
  }
  state.t++;
  const c1 = 1 - 0.9 ** state.t;
  const c2 = 1 - 0.999 ** state.t;
  const next = new Float64Array(r.dim);
  for (let i = 0; i < r.dim; i++) {
    state.m[i] = 0.9 * state.m[i] + 0.1 * g[i];
    state.v[i] = 0.999 * state.v[i] + 0.001 * g[i] * g[i];
    next[i] = theta[i] + r.lr * ((state.m[i] / c1) / (Math.sqrt(state.v[i] / c2) + 1e-8)) - r.lr * r.weight_decay * theta[i];
  }
  return { theta: next, gradNorm: Math.sqrt(norm) };
}

/**
 * One outer step of a train run (DiLoCo): the round's mean weight change is the outer gradient, applied with
 * Nesterov momentum. `momentum` is kept between rounds.
 */
export function outerStep(r: TrainRun, theta: Float32Array, momentum: Float32Array, deltas: Float32Array[]): { theta: Float32Array; norm: number } {
  if (!deltas.length) return { theta, norm: 0 };
  const P = theta.length;
  const next = new Float32Array(P);
  let norm = 0;
  for (let i = 0; i < P; i++) {
    let d = 0;
    for (const x of deltas) d += x[i];
    d /= deltas.length;
    norm += d * d;
    momentum[i] = r.outer_momentum * momentum[i] + d;
    next[i] = theta[i] + r.outer_lr * (d + r.outer_momentum * momentum[i]);
  }
  return { theta: next, norm: Math.sqrt(norm) };
}

/** An EsState as one upload (t, then m and v), and back. */
export function packState(s: EsState | Float32Array): Uint8Array {
  if (s instanceof Float32Array) return f32Bytes(s);
  const out = new Float64Array(1 + s.m.length * 2);
  out[0] = s.t;
  out.set(s.m, 1);
  out.set(s.v, 1 + s.m.length);
  return f64Bytes(out);
}
export function unpackEsState(b: Uint8Array, dim: number): EsState {
  const x = readF64(b);
  if (x.length !== 1 + dim * 2) throw new Error("the saved optimizer state doesn't match the run's dim");
  return { t: x[0], m: x.slice(1, 1 + dim), v: x.slice(1 + dim) };
}

// ---- the brain fitness, on a loaded connectome ---------------------------------------------------------------------
/**
 * Score one parameter vector on the integer brain: each input group gets theta[i] (clamped to -2..2) volts per step
 * over its window, and the score is the targets' weighted spike counts less `cost` x sum |amount|. `probe` is
 * src/probe.ts runProbe and `cellsOf` world/src/connectome.ts cells, passed in so this file stays free of the model.
 */
export function brainScore(
  f: BrainFitness, x: Float64Array, episode: number,
  probe: (p: { stimuli: unknown[]; steps: number; gain: number; tonic: number; seed: number; record: ("descending" | "wing")[]; bin_steps: number }) => Uint8Array,
  columnsOf: (types: string[], side?: "L" | "R") => number[],
): number {
  const amounts = Array.from(x, (v) => Math.max(-2, Math.min(2, v)));
  const stimuli = f.inputs.map((g, i) => ({ ...(g.types ? { types: g.types } : {}), ...(g.prefixes ? { prefixes: g.prefixes } : {}), ...(g.side ? { side: g.side } : {}),
    amount: Math.round(amounts[i] * 1e4) / 1e4, from: g.from ?? 0, to: g.to ?? f.steps })).filter((s) => s.amount !== 0);
  const counts = new Uint16Array(probe({ stimuli, steps: f.steps, gain: f.gain, tonic: f.tonic, seed: episode, record: ["descending", "wing"], bin_steps: 1 }).buffer.slice(0));
  const columns = counts.length / f.steps;
  let score = 0;
  for (const t of f.targets) {
    const cols = columnsOf(t.types, t.side);
    let spikes = 0;
    for (let s = t.from ?? 0; s < (t.to ?? f.steps); s++) for (const c of cols) spikes += counts[s * columns + c];
    score += t.weight * spikes;
  }
  for (const a of amounts) score -= f.cost * Math.abs(a);
  return score;
}
