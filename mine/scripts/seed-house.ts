/**
 * Start our own work on the network: house orders for brain tuning, world simulations, encoding datasets (brain ->
 * words, brain -> trades) and demo programs. Skips any label that already exists, so it's safe to run again.
 *
 *   set -a; source mine/.env.local; set +a
 *   node mine/scripts/seed-house.ts [--dry-run] [--only encoding/] [--server $SERVER]
 *
 * Read the results with scripts/pull-house.ts. What each order is for:
 *   tuning/*     the screen's sensory -> motor map at more gains, tonics and strengths: settings for the sshfighter bot,
 *                the market encoder and the Flybook brain (compare with world/tools/sweep.ts and sweep.py)
 *   world/*      the world simulation over many seeds: survival, feeding, mating and population, and learning on vs off
 *                with the same seeds (a paired comparison, like world/tools/lifedata.ts)
 *   encoding/*   descending and wing motor neuron spikes, 100 ms bins, per stimulus: data to fit Flybook's translator
 *                (words: flybook/worker/episode.py SENSES, 0.5 s rest, 1 s stimulus at 0.8) and the market's action
 *                reader (graded target / threat / wind drives, with and without PAM reward)
 *   demo/*       example programs (mine/examples) running on real miners: pi, Mandelbrot tiles, TSP restarts
 *   colosseum/*  Fly Colosseum practice fights between random fighters: what each stat point is really worth
 */
import { readFileSync } from "node:fs";
import { CHANNELS } from "../src/model.ts";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SERVER = arg("server") ?? process.env.SERVER ?? "https://flyai-mine.fly.dev";
const TOKEN = process.env.ADMIN_TOKEN ?? "";
const DRY = process.argv.includes("--dry-run");
const ONLY = arg("only") ?? "";
if (!TOKEN && !DRY) throw new Error("ADMIN_TOKEN isn't set (source mine/.env.local)");

async function call(path: string, body?: unknown): Promise<any> {
  const res = await fetch(SERVER + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: body === undefined ? undefined : body instanceof Uint8Array ? (body as BodyInit) : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${json.error ?? `HTTP ${res.status}`}`);
  return json;
}
const upload = async (file: string) => {
  const res = await fetch(`${SERVER}/api/blobs`, { method: "POST", body: readFileSync(new URL(file, import.meta.url)) as BodyInit });
  return (await res.json()).hash as string;
};

// ---- brain tuning: wider than the free screen's grid ----
const tuning = (channels: string[]) => ({
  kind: "connectome-sweep", channels: [...channels, "none"], sides: ["L", "R"], amounts: [0.1, 0.2, 0.4, 0.8, 1.2],
  gains: [1.5, 2, 3, 4], tonics: [0.07, 0.1, 0.14], seeds: 5, warm: 250,
});

// ---- encoding: Flybook's words, and the market's drives ----
const WARM = 25; // 0.5 s at 20 ms steps
const STIM_END = 75; // then 1 s of stimulus
const on = (sense: string, amount: number) => ({ sense, amount, from: WARM, to: STIM_END });
const words = ["threat", "mate", "wind", "taste", "touch", "cva"];
const levels = [0.2, 0.5, 0.8, 1.2, 1.6];
const REWARD = 0.24; // PAM_PER_DOPAMINE 0.3 x the words' 0.8
const probe = (conditions: { name: string; stimuli: unknown[] }[], seeds: number) => ({
  kind: "probe", seeds, steps: STIM_END, gain: 3, tonic: 0.14, bin_steps: 5, record: ["descending", "wing"], conditions,
});

const ORDERS: { label: string; spec: () => Promise<object> | object; max_parallel?: number; units?: number }[] = [
  { label: "tuning/threat", spec: () => tuning(["LC4", "LPLC2"]) },
  { label: "tuning/target", spec: () => tuning(["LC10a"]) },
  { label: "tuning/touch", spec: () => tuning(["SNta"]) },
  { label: "world/life", spec: () => ({ kind: "world", seeds: 200, flies: 24, seconds: 600, genes: "vary", sample_s: 10 }) },
  { label: "world/learning-on", spec: () => ({ kind: "world", seeds: 100, seed_base: 5000, flies: 24, seconds: 900, genes: "vary", learning: { hebbian: true, reward: true, mb: true }, sample_s: 10 }) },
  { label: "world/learning-off", spec: () => ({ kind: "world", seeds: 100, seed_base: 5000, flies: 24, seconds: 900, genes: "vary", learning: { hebbian: false, reward: false, mb: false }, sample_s: 10 }) },
  {
    label: "encoding/words",
    spec: () => probe([{ name: "nothing", stimuli: [] }, ...words.map((w) => ({ name: w, stimuli: [on(w, 0.8)] }))], 300),
  },
  {
    label: "encoding/market",
    spec: () => probe([
      { name: "nothing", stimuli: [] },
      ...["mate", "threat", "wind"].flatMap((sense) => levels.map((a) => ({ name: `${sense === "mate" ? "target" : sense}-${String(a).replace(".", "_")}`, stimuli: [on(sense, a)] }))),
      { name: "reward", stimuli: [on("reward", REWARD)] },
      { name: "target-reward", stimuli: [on("mate", 0.8), on("reward", REWARD)] },
      { name: "threat-reward", stimuli: [on("threat", 0.8), on("reward", REWARD)] },
    ], 150),
  },
  { label: "demo/montecarlo-pi", spec: async () => ({ kind: "wasm", program: await upload("../examples/pi-rust/pi.wasm"), count: 2000, timeout_s: 30, redundancy: 2 }), units: 2 },
  { label: "demo/mandelbrot", spec: async () => ({ kind: "wasm", program: await upload("../examples/mandelbrot-tiles/mandelbrot_tiles.wasm"), count: 64, timeout_s: 60, redundancy: 2 }), units: 3 },
  { label: "demo/tsp", spec: async () => ({ kind: "wasm", program: await upload("../examples/tsp-search/tsp_search.wasm"), count: 1000, timeout_s: 30, redundancy: 2 }), units: 1 },

  // ---- round 2 (2026-09-17): the first eleven all finished, so "also run programs" had nothing to run ----
  // wider sweeps, longer and denser worlds, finer stimulus levels, and more of the example programs
  { label: "tuning/all-channels", spec: () => tuning([...CHANNELS]) },
  { label: "world/life-long", spec: () => ({ kind: "world", seeds: 300, seed_base: 20000, flies: 24, seconds: 1200, genes: "vary", sample_s: 10 }) },
  { label: "world/crowd", spec: () => ({ kind: "world", seeds: 200, seed_base: 30000, flies: 48, seconds: 600, genes: "vary", sample_s: 10 }) },
  { label: "world/learning-on-2", spec: () => ({ kind: "world", seeds: 300, seed_base: 40000, flies: 24, seconds: 900, genes: "vary", learning: { hebbian: true, reward: true, mb: true }, sample_s: 10 }) },
  { label: "world/learning-off-2", spec: () => ({ kind: "world", seeds: 300, seed_base: 40000, flies: 24, seconds: 900, genes: "vary", learning: { hebbian: false, reward: false, mb: false }, sample_s: 10 }) },
  {
    // every word at four strengths: how the motor read-out grows with the drive, for Flybook's translator
    label: "encoding/words-graded",
    spec: () => probe([{ name: "nothing", stimuli: [] },
      ...words.flatMap((w) => [0.3, 0.6, 0.9, 1.2].map((a) => ({ name: `${w}-${String(a).replace(".", "_")}`, stimuli: [on(w, a)] })))], 200),
  },
  {
    // the market's drives paired with reward, and two senses at once: what the reader has to tell apart
    label: "encoding/market-pairs",
    spec: () => probe([{ name: "nothing", stimuli: [] },
      ...["mate", "threat", "wind"].flatMap((sense) => [0.4, 0.8, 1.2].flatMap((a) => [
        { name: `${sense === "mate" ? "target" : sense}-${String(a).replace(".", "_")}`, stimuli: [on(sense, a)] },
        { name: `${sense === "mate" ? "target" : sense}-${String(a).replace(".", "_")}-reward`, stimuli: [on(sense, a), on("reward", REWARD)] },
      ])),
      { name: "target-threat", stimuli: [on("mate", 0.8), on("threat", 0.8)] },
      { name: "wind-threat", stimuli: [on("wind", 0.8), on("threat", 0.8)] }], 150),
  },
  { label: "demo/montecarlo-pi-2", spec: async () => ({ kind: "wasm", program: await upload("../examples/pi-rust/pi.wasm"), count: 8000, timeout_s: 30, redundancy: 2 }), units: 2 },
  { label: "demo/mandelbrot-2", spec: async () => ({ kind: "wasm", program: await upload("../examples/mandelbrot-tiles/mandelbrot_tiles.wasm"), count: 256, timeout_s: 60, redundancy: 2 }), units: 3 },
  { label: "demo/tsp-2", spec: async () => ({ kind: "wasm", program: await upload("../examples/tsp-search/tsp_search.wasm"), count: 4000, timeout_s: 30, redundancy: 2 }), units: 1 },
  // round 3 (2026-10-01): the Fly Colosseum on the network. 5,000 practice fights between fighters with random stats
  // (0..30 each, independent) measure what one point of each stat moves the chance to win to about +/-0.1 points
  // (balanceSummary on /compute/results). A finished season's replay is queued by scripts/colosseum-replay.ts.
  { label: "colosseum/balance-1", spec: () => ({ kind: "fight", seeds: 5000, seed_base: 1, max_stat: 30 }) },
];

const existing = new Set(((await (await fetch(`${SERVER}/api/house`)).json()).orders as { label: string }[]).map((o) => o.label));
for (const o of ORDERS) {
  if (ONLY && !o.label.startsWith(ONLY)) continue;
  if (existing.has(o.label)) {
    console.log(`skip   ${o.label} (already there)`);
    continue;
  }
  if (DRY) {
    const spec = o.label.startsWith("demo/") ? "(uploads the example)" : JSON.stringify(await o.spec()).slice(0, 140);
    console.log(`would  ${o.label} ${spec}`);
    continue;
  }
  const made = await call("/api/admin/house", { label: o.label, spec: await o.spec(), max_parallel: o.max_parallel ?? 64, ...(o.units !== undefined ? { units: o.units } : {}) });
  console.log(`start  ${o.label}: ${made.jobs.toLocaleString("en-US")} jobs`);
}
