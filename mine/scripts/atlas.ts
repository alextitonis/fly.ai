/**
 * The sensory -> descending neuron atlas (mine/dataset/PLAN.md step 3): drive every sensory cell type, one side at a
 * time, at three strengths, and record every descending and wing motor neuron. Orders are probe house orders, started
 * by scripts/seed-house.ts --only atlas/, pulled by scripts/pull-house.ts --label atlas/, and folded here into
 * atlas.csv.gz by scripts/export-dataset.ts.
 *
 * One job: 15 s, the screen's own 750 steps and gain 3 / tonic 0.14, read as three 5 s bins (rest | early | late).
 * Same window as a screen job, so the five screen channels can be compared directly with /api/results.
 */
import { createWriteStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createGzip } from "node:zlib";
import type { ConnectomeMeta } from "../../world/src/connectome.ts";
import { ATLAS_HEADER, ATLAS_PREFIX, atlasInputs, atlasLines, readouts, runTotals, type AtlasInput, type Runs } from "../src/fold.ts";

export { ATLAS_PREFIX, atlasInputs, readouts, type AtlasInput };
const AMOUNTS = [0.2, 0.4, 0.8];
const SEEDS = 10;
const SEED_BASE = 70_000;
const STEPS = 750;
const WARM = 250;
const BIN_STEPS = 250;
const PER_ORDER = 64; // orders.ts: a list holds at most 64 values
/**
 * Points per job. Measured 2026-11-01, one thread: an atlas job 7.4 s, the screen's grid about 6.9 s on average (its
 * quiet tonic 0.1 third takes under 2 s). 7.5 would pay ~7% under the screen; 8 x PROGRAM_BONUS 1.01 keeps it even.
 */
export const ATLAS_UNITS = 8;

/** All the orders. Condition names are positional (type names hold commas, which a name can't); the stimulus names the type. */
export function atlasOrders(meta: ConnectomeMeta, seeds = SEEDS): { label: string; spec: object; inputs: AtlasInput[] }[] {
  const inputs = atlasInputs(meta);
  const conditions: { name: string; stimuli: object[]; input: AtlasInput | null }[] = [{ name: "nothing", stimuli: [], input: null }];
  inputs.forEach((input, i) => {
    for (const amount of AMOUNTS) {
      conditions.push({
        name: `i${i}-${input.side}-${String(amount).replace(".", "_")}`, input,
        stimuli: [{ types: [input.type], side: input.side, amount, from: WARM, to: STEPS }],
      });
    }
  });
  const orders: { label: string; spec: object; inputs: AtlasInput[] }[] = [];
  for (let at = 0, k = 0; at < conditions.length; at += PER_ORDER, k++) {
    const part = conditions.slice(at, at + PER_ORDER);
    orders.push({
      label: `${ATLAS_PREFIX}/p${String(k).padStart(2, "0")}`,
      inputs: part.flatMap((c) => (c.input ? [c.input] : [])),
      spec: {
        kind: "probe", seeds, seed_base: SEED_BASE, steps: STEPS, gain: 3, tonic: 0.14, bin_steps: BIN_STEPS, record: ["descending", "wing"],
        conditions: part.map(({ name, stimuli }) => ({ name, stimuli })),
      },
    });
  }
  return orders;
}

// ---- folding a pull into a table ----------------------------------------------------------------------------------
/**
 * Fold a pulled atlas (<house>/atlas/sensory-dn-1/pNN/<order id>/) into a gzipped long table, one row per input x side x
 * amount x readout group. Rates are spikes per neuron per second, per seed, then mean and sd over the seeds.
 */
export async function foldAtlas(house: string, out: string, inputs: AtlasInput[]): Promise<{ orders: number; conditions: number; rows: number; jobs: number; seeds_min: number; seeds_max: number } | null> {
  const root = join(house, ATLAS_PREFIX);
  if (!existsSync(root)) return null;
  const gz = createGzip();
  const file = createWriteStream(out);
  const done = new Promise<void>((resolve, reject) => { file.on("finish", resolve); file.on("error", reject); gz.on("error", reject); });
  gz.pipe(file);
  const write = (line: string) => (gz.write(line) ? Promise.resolve() : new Promise<void>((r) => gz.once("drain", () => r())));
  await write(`${ATLAS_HEADER}\n`);

  const totals = { orders: 0, conditions: 0, rows: 0, jobs: 0, seeds_min: Infinity, seeds_max: 0 };
  for (const part of readdirSync(root).sort()) {
    for (const id of readdirSync(join(root, part))) {
      const dir = join(root, part, id);
      const order = JSON.parse(readFileSync(join(dir, "order.json"), "utf8"));
      const { per_seed: perSeed } = order.spec;
      const groups = readouts(JSON.parse(readFileSync(join(dir, "outputs", "layout.json"), "utf8")));
      const width = groups.reduce((a, g) => a + g.columns.length, 0);
      // condition -> seed runs
      const runs: Runs = new Map();
      for (const line of readFileSync(join(dir, "results.jsonl"), "utf8").split("\n")) {
        if (!line) continue;
        const row = JSON.parse(line);
        const path = join(dir, "outputs", `${row.seq}.u16`);
        if (row.error || !existsSync(path)) continue;
        const b = readFileSync(path);
        if (b.length !== 3 * width * 2) throw new Error(`${path}: ${b.length} bytes, want ${3 * width * 2}`);
        const c = row.index % perSeed;
        runs.set(c, [...(runs.get(c) ?? []), new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))]);
      }
      totals.orders++;
      const read = runTotals(runs);
      totals.jobs += read.jobs;
      totals.conditions += read.conditions;
      if (read.conditions) {
        totals.seeds_min = Math.min(totals.seeds_min, read.seeds_min);
        totals.seeds_max = Math.max(totals.seeds_max, read.seeds_max);
      }
      // the test's spec has no step counts; the atlas's bins are always BIN_STEPS
      const lines = atlasLines({ ...order.spec, params: { ...order.spec.params, bin_steps: BIN_STEPS } }, groups, runs, inputs);
      totals.rows += lines.length;
      if (lines.length) await write(`${lines.join("\n")}\n`);
    }
  }
  gz.end();
  await done;
  return totals.orders ? totals : null;
}
