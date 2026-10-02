/**
 * Paid compute: anyone describes a sweep of brain runs, sets a bid per job and a budget, and the network runs it
 * ahead of the free screen. When miners claim work, live orders are picked at random with odds in proportion to
 * their bids, so a higher bid (which feeds the pool more) gets done sooner.
 *
 * An order runs until its sweep is done, its budget is spent, its time limit passes, or its wallet stops it.
 * Each job is charged at the bid when its answer settles, and POOL_SHARE of every charge goes into that month's
 * miner pool. Whatever isn't spent returns to the wallet's balance, which can fund its next order.
 * At most `max_parallel` of an order's jobs are out at once (the buyer's choice, capped by ORDER_MAX_PARALLEL), and
 * each job has one holder at a time, so that also caps how many miners work one order together.
 *
 * No contract: the buyer funds an order with a plain ERC-20 transfer to PAY_TO, and the server reads the receipt.
 * A transfer carries no memo, so each order's budget ends in a tag of up to 999,999 wei that no other unpaid order
 * has. The exact amount, the sender (the order's wallet) and a block no older than the order identify the order,
 * so nobody can put someone else's payment toward an order of their own. Spending a balance or stopping an order
 * takes a signature from the wallet (`intentMessage`).
 *
 * Jobs are identified by their params (tasks.params is unique), so a sweep overlapping work the network has already
 * settled gets those answers at once, at CACHED_PRICE (or the bid, if lower). That's how finished work is resold.
 *
 * `kind` names the work: "connectome-sweep" (the brain, checked by the server) or a buyer's own program, "wasm" or
 * "wgsl" (see `openSpec`), which miners run in a sandbox and the buyer judges (agreement, or disputed answers).
 */
import { postRpc } from "./rpcpool.ts";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { CHANNELS } from "./model.ts";
import { fromWei, toWei } from "./payouts.ts";
import type { TaskParams } from "./runner.ts";
import { checksumAddress } from "./wallet.ts";

/** Every job keeps the screen's length: a GPU batch must share a step count, and miners already out there expect it. */
export const ORDER_STEPS = 750;

export interface OrderConfig {
  /** where payments go; orders are off while unset */
  payTo: string | null;
  token: string;
  /** whole tokens: the lowest bid per job */
  minBid: string;
  /** whole tokens per job whose answer is already settled (or the bid, if lower) */
  cachedPrice: string;
  /** share of each charge added to the month's miner pool */
  poolShare: number;
  /** jobs in one sweep */
  maxJobs: number;
  /** jobs of one order out at once */
  maxParallel: number;
  maxHours: number;
  /** minutes an unpaid order waits for its payment */
  ttlMin: number;
  /** distinct clean miners (or wallets) that must return the same answer before a paid job counts as settled */
  redundancy: number;
}

export function orderConfig(env: NodeJS.ProcessEnv, token: string): OrderConfig {
  const cfg: OrderConfig = {
    payTo: env.PAY_TO ? checksumAddress(env.PAY_TO) : null,
    token,
    minBid: env.MIN_BID ?? "1000",
    cachedPrice: env.CACHED_PRICE ?? "250",
    poolShare: Number(env.POOL_SHARE ?? "0.8"),
    maxJobs: Number(env.ORDER_MAX_JOBS ?? "50000"),
    maxParallel: Number(env.ORDER_MAX_PARALLEL ?? "64"),
    maxHours: Number(env.ORDER_MAX_HOURS ?? "720"),
    ttlMin: Number(env.ORDER_TTL_MIN ?? "60"),
    redundancy: Number(env.ORDER_REDUNDANCY ?? "2"),
  };
  toWei(cfg.minBid);
  toWei(cfg.cachedPrice);
  if (!(cfg.poolShare >= 0 && cfg.poolShare <= 1)) throw new Error("POOL_SHARE is 0..1");
  if (!(cfg.redundancy >= 1)) throw new Error("ORDER_REDUNDANCY is at least 1");
  if (!(cfg.maxParallel >= 1)) throw new Error("ORDER_MAX_PARALLEL is at least 1");
  return cfg;
}

export class SpecError extends Error {}

const list = (v: unknown, name: string): unknown[] => {
  if (!Array.isArray(v) || !v.length) throw new SpecError(`${name} must be a non-empty list`);
  if (v.length > 64) throw new SpecError(`${name}: at most 64 values`);
  return v;
};

/** A finite number in [lo, hi], rounded to 4 decimals so equal sweeps produce equal params. */
function num(v: unknown, name: string, lo: number, hi: number): number {
  const x = typeof v === "string" ? Number(v) : v;
  if (typeof x !== "number" || !Number.isFinite(x) || x < lo || x > hi) throw new SpecError(`${name} must be a number from ${lo} to ${hi}`);
  return Number(x.toFixed(4));
}

function int(v: unknown, name: string, lo: number, hi: number): number {
  if (!Number.isSafeInteger(v) || (v as number) < lo || (v as number) > hi) throw new SpecError(`${name} must be a whole number from ${lo} to ${hi}`);
  return v as number;
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

/**
 * The jobs a spec asks for, in the screen's param shape (so overlapping jobs are the same task), without duplicates.
 *
 *   { kind: "connectome-sweep", channels: ["LPLC2", "none"], sides: ["L", "R"], amounts: [0.2, 0.4],
 *     gains: [3], tonics: [0.14], seeds: 3 | [1, 2, 3], warm: 250 }
 *
 * "none" is an undriven control, run once per gain, tonic and seed whatever the sides and amounts.
 */
export function expandSpec(spec: any, maxJobs: number): { spec: object; jobs: TaskParams[] } {
  if (!spec || typeof spec !== "object") throw new SpecError("spec must be an object");
  if (spec.kind !== "connectome-sweep") throw new SpecError(`unknown kind ${JSON.stringify(spec.kind)}; the only kind is "connectome-sweep"`);
  const channels = uniq(list(spec.channels, "channels").map((c) => {
    if (c !== "none" && !(CHANNELS as readonly unknown[]).includes(c)) throw new SpecError(`channel ${JSON.stringify(c)}: pick from ${[...CHANNELS, "none"].join(", ")}`);
    return c as TaskParams["channel"];
  }));
  const sides = uniq(list(spec.sides ?? ["L", "R"], "sides").map((s) => {
    if (s !== "L" && s !== "R") throw new SpecError("sides are L and R");
    return s as "L" | "R";
  }));
  const driven = channels.some((c) => c !== "none");
  const amounts = driven ? uniq(list(spec.amounts, "amounts").map((a) => num(a, "amount", 0.0001, 2))) : [];
  const gains = uniq(list(spec.gains ?? [3], "gains").map((g) => num(g, "gain", 0.5, 8)));
  const tonics = uniq(list(spec.tonics ?? [0.14], "tonics").map((t) => num(t, "tonic", 0, 0.5)));
  const seeds = typeof spec.seeds === "number"
    ? Array.from({ length: int(spec.seeds, "seeds", 1, 1000) }, (_, i) => i + 1)
    : uniq(list(spec.seeds, "seeds").map((s) => int(s, "seed", 0, 2 ** 31 - 1)));
  const warm = int(spec.warm ?? 250, "warm", 0, ORDER_STEPS - 1);

  const total = gains.length * tonics.length * seeds.length
    * ((channels.includes("none") ? 1 : 0) + channels.filter((c) => c !== "none").length * sides.length * amounts.length);
  if (total > maxJobs) throw new SpecError(`that's ${total.toLocaleString("en-US")} jobs; one order holds at most ${maxJobs.toLocaleString("en-US")}`);

  // seeds outermost: an order stopped by its budget or time limit has whole seeds of every condition
  const jobs: TaskParams[] = [];
  for (const seed of seeds) {
    for (const gain of gains) {
      for (const tonic of tonics) {
        for (const channel of channels) {
          // key order matches the screen's (server.ts round()), so the same job is the same params string
          if (channel === "none") jobs.push({ channel, side: "L", amount: 0, gain, tonic, seed, steps: ORDER_STEPS, warm });
          else for (const side of sides) for (const amount of amounts) jobs.push({ channel, side, amount, gain, tonic, seed, steps: ORDER_STEPS, warm });
        }
      }
    }
  }
  return { spec: { kind: "connectome-sweep", channels, sides, amounts, gains, tonics, seeds, warm }, jobs };
}

export interface OrderTerms {
  bid: bigint;
  budget: bigint;
  /** null: no time limit */
  hours: number | null;
  maxParallel: number;
}

/** A buyer's bid, budget, time limit and parallelism, checked against the server's limits. */
export function orderTerms(cfg: OrderConfig, body: any, minBid = cfg.minBid): OrderTerms {
  const wei = (v: unknown, name: string) => {
    try {
      return toWei(String(v ?? ""));
    } catch {
      throw new SpecError(`${name} is a number of tokens`);
    }
  };
  const bid = wei(body.bid ?? minBid, "bid");
  if (bid < toWei(minBid)) throw new SpecError(`the lowest bid is ${minBid} per job`);
  const budget = wei(body.budget, "budget");
  // one settled job (at the cached charge) is the least an order can buy
  if (budget < cachedCharge(cfg, bid)) throw new SpecError("the budget must cover at least one job");
  if (budget > toWei("1000000000000")) throw new SpecError("that budget is too large");
  const noHours = body.hours === undefined || body.hours === null || body.hours === "";
  const hours = noHours ? null : num(body.hours, "hours", 0.25, cfg.maxHours);
  const noParallel = body.max_parallel === undefined || body.max_parallel === null || body.max_parallel === "";
  const maxParallel = noParallel ? cfg.maxParallel : int(Number(body.max_parallel), "max_parallel", 1, cfg.maxParallel);
  return { bid, budget, hours, maxParallel };
}

/** What a charge for an already settled job is: CACHED_PRICE, or the bid if that's lower. */
export const cachedCharge = (cfg: OrderConfig, bid: bigint): bigint => {
  const c = toWei(cfg.cachedPrice);
  return c < bid ? c : bid;
};

/** What a whole sweep would cost at `bid`: fresh jobs at the bid, settled ones at the cached charge. */
export const sweepCost = (cfg: OrderConfig, bid: bigint, fresh: number, cached: number): bigint =>
  bid * BigInt(fresh) + cachedCharge(cfg, bid) * BigInt(cached);

/** The part of a charge that goes to the miners' pool, to the wei. */
export const poolPart = (cfg: OrderConfig, charge: bigint): bigint => (charge * BigInt(Math.round(cfg.poolShare * 10_000))) / 10_000n;

/** The text a wallet signs to spend its balance on an order, or to stop one. The server writes it; clients never do. */
export function intentMessage(a: { action: "fund" | "stop"; order: string; wallet: string; budget: string; nonce: string; expires: Date; symbol: string }): string {
  return [
    "fly.ai compute",
    a.action === "fund" ? `Fund order ${a.order} with ${a.budget} ${a.symbol} from my balance.` : `Stop order ${a.order}. What it hasn't spent returns to my balance.`,
    `Wallet: ${a.wallet}`,
    `Nonce: ${a.nonce}`,
    `Expires: ${a.expires.toISOString()}`,
  ].join("\n");
}

export const TAG_MAX = 1_000_000;

// ---- payments on-chain ------------------------------------------------------------------------------------
export const TRANSFER_TOPIC = `0x${Buffer.from(keccak_256(new TextEncoder().encode("Transfer(address,address,uint256)"))).toString("hex")}`;
export const TRANSFER_SELECTOR = `0x${Buffer.from(keccak_256(new TextEncoder().encode("transfer(address,uint256)")).subarray(0, 4)).toString("hex")}`;

export interface Transfer {
  from: string;
  value: bigint;
  /** block time, ms */
  at: number;
}

export async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const body = await postRpc(url, { jsonrpc: "2.0", id: 1, method, params });   // the next public RPC if this one fails
  if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result;
}

/**
 * The `token` transfers to `payTo` in a transaction: null while it isn't mined yet, [] if it failed or paid
 * nothing there.
 */
export async function transfersIn(rpcUrl: string, txHash: string, token: string, payTo: string): Promise<Transfer[] | null> {
  const receipt = await rpc(rpcUrl, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) return null;
  if (receipt.status !== "0x1") return [];
  const to = `0x${payTo.slice(2).toLowerCase().padStart(64, "0")}`;
  const logs = (receipt.logs as { address: string; topics: string[]; data: string }[]).filter((l) =>
    l.address.toLowerCase() === token.toLowerCase() && l.topics.length === 3 && l.topics[0] === TRANSFER_TOPIC && l.topics[2].toLowerCase() === to);
  if (!logs.length) return [];
  const block = await rpc(rpcUrl, "eth_getBlockByNumber", [receipt.blockNumber, false]);
  const at = Number(BigInt(block.timestamp)) * 1000;
  return logs.map((l) => ({ from: checksumAddress(`0x${l.topics[1].slice(-40)}`), value: BigInt(l.data), at }));
}

export { fromWei };

// ---- a buyer's own program ----------------------------------------------------------------------------------
export const HASH = /^[0-9a-f]{64}$/;
/** the longest a program may run per job */
export const MAX_TIMEOUT_S = 600;
/** bytes a job may output (WASM up to this; a shader exactly its output_bytes, up to this) */
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export interface OpenSpec {
  kind: "wasm" | "wgsl" | "embed";
  /** sha256 of the uploaded module or shader; for embed, the model's id in EMBED_MODELS */
  program: string;
  /** sha256 of each job's input, one job per entry in order; or INDEX_INPUT, where the job's input is its index */
  inputs: string[];
  timeout_s: number;
  /** clean miners that must return the same answer before a job settles (1 trusts the first) */
  redundancy: number;
  /** "exact", or for shaders a tolerance: outputs read as f32 that differ by at most this still agree; for
   *  embeddings the lowest cosine similarity at which two answers' vectors (row by row) still agree */
  compare: "exact" | { f32_tolerance: number } | { cosine: number };
  dispatch: [number, number, number] | null;
  output_bytes: number | null;
  /** the order stays live when its jobs are all done, waiting for more (POST /api/orders/:id/jobs) */
  keep_open: boolean;
}

/** An input that is just the job's index, 4 bytes little-endian: `count` jobs need no uploads. */
export const INDEX_INPUT = "#index";

export const isOpenKind = (kind: unknown): kind is "wasm" | "wgsl" | "embed" => kind === "wasm" || kind === "wgsl" || kind === "embed";

// ---- embeddings: text in, vectors out, on the miner's GPU (or CPU) -------------------------------------------------
/**
 * The models an embed order may ask for, each pinned to one revision so every miner runs the same weights. Miners
 * run them with transformers.js in fp32; measured on an RTX 4060 vs the WASM CPU backend, the lowest cosine between
 * the two was 0.9999995, so the default 0.9999 agreement bar passes honest hardware and fails anything made up.
 */
export const EMBED_MODELS: Record<string, { repo: string; revision: string; dim: number; pooling: "mean" | "cls"; mb: number; about: string }> = {
  "minilm-l6": {
    repo: "Xenova/all-MiniLM-L6-v2", revision: "751bff37182d3f1213fa05d7196b954e230abad9", dim: 384, pooling: "mean", mb: 90,
    about: "all-MiniLM-L6-v2: fast general-purpose English sentence embeddings (256 tokens)",
  },
  "bge-small-en": {
    repo: "Xenova/bge-small-en-v1.5", revision: "ea104dacec62c0de699686887e3f920caeb4f3e3", dim: 384, pooling: "cls", mb: 133,
    about: "bge-small-en-v1.5: stronger English retrieval embeddings (512 tokens)",
  },
};
/** texts in one embed job, the longest text, and the input's size */
export const EMBED_LIMITS = { texts: 256, chars: 8_000, bytes: 1_000_000 };
export const EMBED_COSINE = 0.9999;

/** An embed job's input: a JSON array of 1..256 strings. Returns the texts, or throws SpecError saying what's wrong. */
export function embedTexts(bytes: Uint8Array): string[] {
  if (bytes.length > EMBED_LIMITS.bytes) throw new SpecError(`an embed input is at most ${EMBED_LIMITS.bytes.toLocaleString("en-US")} bytes`);
  let texts: unknown;
  try {
    texts = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new SpecError("an embed input is a UTF-8 JSON array of strings");
  }
  if (!Array.isArray(texts) || !texts.length || texts.length > EMBED_LIMITS.texts) throw new SpecError(`an embed input is a JSON array of 1 to ${EMBED_LIMITS.texts} strings`);
  for (const t of texts) {
    if (typeof t !== "string" || !t.trim()) throw new SpecError("every text in an embed input is a non-empty string");
    if (t.length > EMBED_LIMITS.chars) throw new SpecError(`texts are at most ${EMBED_LIMITS.chars.toLocaleString("en-US")} characters (the models read the first 256-512 tokens anyway)`);
  }
  return texts as string[];
}

/** Whether two embed answers agree: same shape, and every row's vectors at least `min` cosine-similar. */
export function cosineAgree(a: Uint8Array, b: Uint8Array, dim: number, min: number): boolean {
  if (a.length !== b.length || a.length % (dim * 4)) return false;
  const x = new Float32Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.length));
  const y = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  for (let row = 0; row < x.length; row += dim) {
    let dot = 0;
    let nx = 0;
    let ny = 0;
    for (let k = row; k < row + dim; k++) {
      dot += x[k] * y[k];
      nx += x[k] * x[k];
      ny += y[k] * y[k];
    }
    const cos = dot / Math.sqrt(nx * ny);
    if (!(cos >= min)) return false; // NaN and zero vectors fail
  }
  return true;
}
/** Every kind settled by miners agreeing, with outputs stored as uploads: buyers' programs and our own house kinds. */
export const isProgramKind = (kind: unknown): boolean => isOpenKind(kind) || isHouseKind(kind);

/** Our own job kinds: the miner already has the code, only the job's parameters travel. */
export const isHouseKind = (kind: unknown): kind is "world" | "probe" | "fight" => kind === "world" || kind === "probe" || kind === "fight";

/**
 * A wasm or wgsl spec, normalized. Program and input hashes are checked against the uploads by the server.
 *
 *   { kind: "wasm", program: "<sha256>", inputs: ["<sha256>", ...], timeout_s: 60, redundancy: 2, keep_open: false }
 *   { kind: "wasm", program: "<sha256>", count: 1000 }       // 1000 jobs, each given its index (u32 LE) as input
 *   { kind: "wgsl", program, inputs, dispatch: [64, 1, 1], output_bytes: 4096, compare: { f32_tolerance: 1e-5 }, ... }
 */
export function openSpec(spec: any, maxJobs: number): OpenSpec {
  if (!spec || typeof spec !== "object" || !isOpenKind(spec.kind)) throw new SpecError("kind is connectome-sweep, wasm, wgsl or embed");
  if (spec.kind === "embed") return embedSpec(spec, maxJobs);
  if (typeof spec.program !== "string" || !HASH.test(spec.program)) throw new SpecError("program is the sha256 of an upload (POST /api/blobs)");
  if (spec.count !== undefined && spec.inputs !== undefined) throw new SpecError("give inputs or count, not both");
  const inputs = spec.count !== undefined ? Array.from({ length: int(spec.count, "count", 1, maxJobs) }, () => INDEX_INPUT) : spec.inputs ?? [];
  if (!Array.isArray(inputs) || inputs.some((h) => typeof h !== "string" || !(HASH.test(h) || h === INDEX_INPUT))) throw new SpecError("inputs is a list of upload sha256s");
  if (inputs.length > maxJobs) throw new SpecError(`one order holds at most ${maxJobs.toLocaleString("en-US")} jobs at a time`);
  const keepOpen = spec.keep_open === true;
  if (!inputs.length && !keepOpen) throw new SpecError("inputs is empty; give inputs, or keep_open to add jobs later");
  const timeout = spec.timeout_s === undefined ? 60 : int(spec.timeout_s, "timeout_s", 1, MAX_TIMEOUT_S);
  const redundancy = spec.redundancy === undefined ? 2 : int(spec.redundancy, "redundancy", 1, 5);
  let compare: OpenSpec["compare"] = "exact";
  let dispatch: OpenSpec["dispatch"] = null;
  let outputBytes: number | null = null;
  if (spec.kind === "wgsl") {
    if (!Array.isArray(spec.dispatch) || spec.dispatch.length < 1 || spec.dispatch.length > 3) throw new SpecError("dispatch is [x, y?, z?] workgroups");
    const d = [0, 1, 2].map((i) => (spec.dispatch[i] === undefined ? 1 : int(spec.dispatch[i], "dispatch", 1, 65535)));
    if (d[0] * d[1] * d[2] > 1 << 20) throw new SpecError("dispatch is at most 1,048,576 workgroups in all");
    dispatch = d as [number, number, number];
    outputBytes = int(spec.output_bytes, "output_bytes", 4, MAX_OUTPUT_BYTES);
    if (spec.compare !== undefined && spec.compare !== "exact") {
      const tol = spec.compare?.f32_tolerance;
      if (typeof tol !== "number" || !(tol >= 0) || tol > 1e6) throw new SpecError('compare is "exact" or {"f32_tolerance": number}');
      compare = { f32_tolerance: tol };
    }
  } else if (spec.compare !== undefined && spec.compare !== "exact") {
    throw new SpecError("wasm jobs compare exactly");
  }
  return { kind: spec.kind, program: spec.program, inputs, timeout_s: timeout, redundancy, compare, dispatch, output_bytes: outputBytes, keep_open: keepOpen };
}

/**
 * An embed spec, normalized: { kind: "embed", model: "minilm-l6", inputs: ["<sha256 of a JSON array of texts>", ...],
 * timeout_s?, redundancy?, compare?: { cosine: 0.9999 }, keep_open? }. Each input is checked by the server (embedTexts).
 */
function embedSpec(spec: any, maxJobs: number): OpenSpec {
  const model = spec.model;
  if (typeof model !== "string" || !Object.hasOwn(EMBED_MODELS, model)) throw new SpecError(`model is one of ${Object.keys(EMBED_MODELS).join(", ")}`);
  if (spec.count !== undefined) throw new SpecError("embed jobs need inputs: upload JSON arrays of texts");
  const inputs = spec.inputs ?? [];
  if (!Array.isArray(inputs) || inputs.some((h) => typeof h !== "string" || !HASH.test(h))) throw new SpecError("inputs is a list of upload sha256s (each a JSON array of texts)");
  if (inputs.length > maxJobs) throw new SpecError(`one order holds at most ${maxJobs.toLocaleString("en-US")} jobs at a time`);
  const keepOpen = spec.keep_open === true;
  if (!inputs.length && !keepOpen) throw new SpecError("inputs is empty; give inputs, or keep_open to add jobs later");
  let cosine = EMBED_COSINE;
  if (spec.compare !== undefined) {
    const c = spec.compare?.cosine;
    if (typeof c !== "number" || !(c >= 0.9 && c <= 1)) throw new SpecError('compare for embed is {"cosine": 0.9 to 1}');
    cosine = c;
  }
  return {
    kind: "embed", program: model, inputs,
    timeout_s: spec.timeout_s === undefined ? 60 : int(spec.timeout_s, "timeout_s", 5, MAX_TIMEOUT_S),
    redundancy: spec.redundancy === undefined ? 2 : int(spec.redundancy, "redundancy", 1, 5),
    compare: { cosine }, dispatch: null, output_bytes: null, keep_open: keepOpen,
  };
}

// ---- house kinds: our own code, shipped with the miner --------------------------------------------------------
/** Flybook's words (flybook/worker/episode.py SENSES) and the market's drives, as stimulus cell types. */
export const SENSES: Record<string, { types?: string[]; prefixes?: string[] }> = {
  threat: { types: ["LC4", "LPLC2"] },
  mate: { types: ["LC10a"] },
  wind: { types: ["JO-CL", "JO-CM", "JO-CA2", "JO-EV1", "JO-EV2", "JO-EV3", "JO-EV5", "JO-EV6", "JO-ED1", "JO-ED2_a", "JO-ED2_b", "JO-ED2_c"] },
  taste: { types: ["claw_tpGRN", "dorsal_tpGRN", "BM_Taste"] },
  touch: { types: ["BM_InOm"] },
  cva: { types: ["ORN_DA1"] },
  reward: { prefixes: ["PAM"] },
};

export interface HouseSpec extends OpenSpec {
  /** world: flies, seconds, genes, learning, sample_s, seed_base; probe: conditions, steps, gain, tonic, record, bin_steps, seed_base */
  params: Record<string, unknown>;
  /** jobs per seed: world 1, probe one per condition */
  per_seed: number;
}

const TYPE_NAME = /^[\w .,:+-]{1,48}$/;

/**
 * A world or probe spec, house orders only. Jobs = seeds x conditions (probe) or seeds (world); each job's seed is
 * seed_base + its seed number, so a later order can continue where one left off.
 *
 *   { kind: "world", seeds: 200, flies: 24, seconds: 600, genes: "vary", learning: {hebbian, reward, mb}, sample_s: 10 }
 *   { kind: "probe", seeds: 50, steps: 75, gain: 3, tonic: 0.14, bin_steps: 5, record: ["descending", "wing"],
 *     conditions: [{ name: "threat", stimuli: [{ sense: "threat", amount: 0.8, from: 25, to: 75 }] }, ...] }
 */
export function houseSpec(spec: any, maxJobs: number): HouseSpec {
  if (!spec || !isHouseKind(spec.kind)) throw new SpecError("house kinds are world, probe and fight");
  const seeds = spec.kind === "fight" && spec.fights !== undefined ? 0 : int(spec.seeds, "seeds", 1, 1_000_000);
  const seedBase = spec.seed_base === undefined ? 1 : int(spec.seed_base, "seed_base", 0, 2 ** 31 - 2_000_000);
  const redundancy = spec.redundancy === undefined ? 2 : int(spec.redundancy, "redundancy", 1, 5);
  let params: Record<string, unknown>;
  let perSeed = 1;
  let timeout = spec.timeout_s === undefined ? 300 : int(spec.timeout_s, "timeout_s", 10, 1800);
  if (spec.kind === "fight") {
    // Fly Colosseum fights (world/src/arena/game.ts runFight): either the listed fights (a season replayed by the
    // network, to check the server's results), or `seeds` practice fights between random fighters (balance testing)
    if (spec.fights !== undefined) {
      const fights = list(spec.fights, "fights").map((f: any, i) => {
        if (typeof f?.server_seed !== "string" || !/^[\w:.-]{1,200}$/.test(f.server_seed)) throw new SpecError(`fight ${i}: server_seed`);
        if (typeof f.digest !== "string" || !/^[\w:.-]{1,200}$/.test(f.digest)) throw new SpecError(`fight ${i}: digest`);
        if (typeof f.label !== "string" || !/^[\w:.-]{1,40}$/.test(f.label)) throw new SpecError(`fight ${i}: label`);
        // what the server's own run of the fight gave (scripts/colosseum-replay.ts): kept here, never sent to miners
        const expect = f.expect === undefined ? null : {
          winner: int(f.expect.winner, `fight ${i} expect.winner`, 0, 1), how: String(f.expect.how ?? ""), rounds: int(f.expect.rounds, `fight ${i} expect.rounds`, 0, 100),
          hp: list(f.expect.hp, `fight ${i} expect.hp`).map((x) => num(x, `fight ${i} expect.hp`, -1e9, 1e9)),
          seeds: f.expect.seeds === undefined ? null : list(f.expect.seeds, `fight ${i} expect.seeds`).map((x) => int(x, `fight ${i} expect.seeds`, 0, 4294967295)),
        };
        return { server_seed: f.server_seed, digest: f.digest, label: f.label, a: fighter(f.a, `fight ${i} a`), b: fighter(f.b, `fight ${i} b`), expect };
      });
      params = { fights };
      perSeed = 1;
      const jobs = fights.length;
      if (jobs > maxJobs) throw new SpecError(`that's ${jobs} jobs; the limit is ${maxJobs}`);
      return {
        kind: spec.kind, program: "", inputs: Array.from({ length: jobs }, () => INDEX_INPUT), timeout_s: timeout, redundancy,
        compare: "exact", dispatch: null, output_bytes: null, keep_open: false, params, per_seed: 1,
      } as HouseSpec;
    }
    params = { seed_base: seedBase, max_stat: int(spec.max_stat ?? 30, "max_stat", 0, 100) };
  } else if (spec.kind === "world") {
    const learning = spec.learning ?? null;
    if (learning !== null && (typeof learning !== "object" || ["hebbian", "reward", "mb"].some((k) => typeof learning[k] !== "boolean"))) {
      throw new SpecError("learning is null or {hebbian, reward, mb} booleans");
    }
    params = {
      flies: int(spec.flies ?? 24, "flies", 1, 80), seconds: int(spec.seconds ?? 600, "seconds", 1, 7200),
      genes: spec.genes === "fixed" ? "fixed" : "vary", learning, sample_s: int(spec.sample_s ?? 10, "sample_s", 1, 600), seed_base: seedBase,
    };
  } else {
    const steps = int(spec.steps ?? 75, "steps", 10, 3000);
    const conditions = list(spec.conditions, "conditions").map((c: any, i) => {
      const name = typeof c?.name === "string" && /^[\w-]{1,40}$/.test(c.name) ? c.name : null;
      if (!name) throw new SpecError(`condition ${i}: name is 1..40 of letters, digits, _ -`);
      const stimuli = (Array.isArray(c.stimuli) ? c.stimuli : []).map((st: any) => {
        const sense = st.sense === undefined ? null : SENSES[st.sense];
        if (st.sense !== undefined && !sense) throw new SpecError(`sense ${JSON.stringify(st.sense)}: pick from ${Object.keys(SENSES).join(", ")}`);
        const types = st.types ?? sense?.types ?? [];
        const prefixes = st.prefixes ?? sense?.prefixes ?? [];
        if (![...types, ...prefixes].length || [...types, ...prefixes].some((t: unknown) => typeof t !== "string" || !TYPE_NAME.test(t))) {
          throw new SpecError(`condition ${name}: a stimulus needs a sense, or types / prefixes of cell type names`);
        }
        const from = int(st.from ?? 0, "from", 0, steps);
        const to = int(st.to ?? steps, "to", from, steps);
        return { types, prefixes, ...(st.side === "L" || st.side === "R" ? { side: st.side } : {}), amount: num(st.amount ?? 0.8, "amount", -2, 2), from, to };
      });
      return { name, stimuli };
    });
    const record = list(spec.record ?? ["descending", "wing"], "record").map((r) => {
      if (r !== "descending" && r !== "wing") throw new SpecError("record is some of descending, wing");
      return r;
    });
    params = {
      steps, gain: num(spec.gain ?? 3, "gain", 0.5, 8), tonic: num(spec.tonic ?? 0.14, "tonic", 0, 0.5),
      bin_steps: int(spec.bin_steps ?? 5, "bin_steps", 1, steps), record: uniq(record), conditions, seed_base: seedBase,
    };
    perSeed = conditions.length;
    // the output (u16 per bin per neuron: ~1,314 descending + 58 wing) must fit an answer
    const neurons = (record.includes("descending") ? 1314 : 0) + (record.includes("wing") ? 58 : 0);
    if (Math.ceil(steps / (params.bin_steps as number)) * neurons * 2 > MAX_OUTPUT_BYTES) throw new SpecError("too many bins for one answer: raise bin_steps");
    if (spec.timeout_s === undefined) timeout = Math.max(60, Math.ceil(steps * 0.1));
  }
  const jobs = seeds * perSeed;
  if (jobs > maxJobs) throw new SpecError(`that's ${jobs} jobs; the limit is ${maxJobs}`);
  return {
    kind: spec.kind, program: "", inputs: Array.from({ length: jobs }, () => INDEX_INPUT), timeout_s: timeout, redundancy,
    compare: "exact", dispatch: null, output_bytes: null, keep_open: false, params, per_seed: perSeed,
  } as HouseSpec;
}

/** A fighter's stats in a fight spec: four whole numbers 0..100. */
function fighter(x: any, what: string): { pow: number; grd: number; vit: number; fury: number } {
  const out = { pow: 0, grd: 0, vit: 0, fury: 0 };
  for (const k of ["pow", "grd", "vit", "fury"] as const) out[k] = int(x?.[k], `${what}.${k}`, 0, 100);
  return out;
}

/** A small seeded generator (practice fighters' stats); the fights themselves use game.ts's own. */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A house job's own parameters from its order spec and index. */
export function houseJob(spec: any, index: number): Record<string, unknown> {
  const p = spec.params;
  const seedNo = Math.floor(index / (spec.per_seed ?? 1));
  if (spec.kind === "world") {
    return { seed: p.seed_base + seedNo, flies: p.flies, seconds: p.seconds, genes: p.genes, learning: p.learning, sample_s: p.sample_s };
  }
  if (spec.kind === "fight") {
    if (p.fights) {
      const { expect: _expect, ...fight } = p.fights[index];
      return fight;
    }
    // a practice fight: two fighters with every stat drawn uniformly from 0..max_stat, so each stat's effect on the
    // win can be read off independently of the others (scripts/colosseum-balance.ts)
    const rng = mulberry32(((p.seed_base + seedNo) * 2654435761) >>> 0);
    const draw = () => ({ pow: Math.floor(rng() * (p.max_stat + 1)), grd: Math.floor(rng() * (p.max_stat + 1)),
      vit: Math.floor(rng() * (p.max_stat + 1)), fury: Math.floor(rng() * (p.max_stat + 1)) });
    return { server_seed: `balance:${p.seed_base}`, digest: "balance", label: String(seedNo), a: draw(), b: draw() };
  }
  const c = p.conditions[index % spec.per_seed];
  return { condition: c.name, stimuli: c.stimuli, steps: p.steps, gain: p.gain, tonic: p.tonic, seed: p.seed_base + seedNo, record: p.record, bin_steps: p.bin_steps };
}

/** Points per settled house job, in brain-job units (a 750-step brain job is 7.5), by the work it takes. */
export function houseUnits(spec: any): number {
  if (spec.kind === "world") return Math.round(spec.params.flies * spec.params.seconds * 0.00225 * 100) / 100;
  if (spec.kind === "probe") return spec.params.steps / 100;
  // measured 2026-10-01: a fight takes 1.5-3.3 s on one core (5-6 rounds of 2 x 25 float steps); a 750-step brain
  // job, 7.5 units, takes ~6 s, so 3.5 keeps the pay per second about even
  if (spec.kind === "fight") return 3.5;
  return 7.5;
}

/** A program's lowest bid: MIN_BID per started 30 seconds of its time limit. */
export const openMinBid = (cfg: OrderConfig, spec: OpenSpec): string =>
  fromWei(toWei(cfg.minBid) * BigInt(Math.ceil(spec.timeout_s / 30)));

/** Whether two shader outputs agree: equal length, and every f32 within the tolerance (NaN only matches NaN). */
export function f32Agree(a: Uint8Array, b: Uint8Array, tolerance: number): boolean {
  if (a.length !== b.length) return false;
  const n = a.length >> 2;
  const x = new Float32Array(a.buffer.slice(a.byteOffset, a.byteOffset + n * 4));
  const y = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + n * 4));
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(x[i]) || Number.isNaN(y[i])) {
      if (!(Number.isNaN(x[i]) && Number.isNaN(y[i]))) return false;
    } else if (!(Math.abs(x[i] - y[i]) <= tolerance)) {
      return false;
    }
  }
  for (let i = n * 4; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
