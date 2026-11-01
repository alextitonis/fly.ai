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

export const ATLAS_PREFIX = "atlas/sensory-dn-1";
const INPUT_CLASSES = ["cb_sensory", "vnc_sensory", "sensory_ascending", "ol_sensory", "visual_projection"];
const AMOUNTS = [0.2, 0.4, 0.8];
const SEEDS = 10;
const SEED_BASE = 70_000;
const STEPS = 750;
const WARM = 250;
const BIN_STEPS = 250;
const PER_ORDER = 64; // orders.ts: a list holds at most 64 values
const DT_S = 0.02;
/**
 * Points per job. Measured 2026-11-01, one thread: an atlas job 7.4 s, the screen's grid about 6.9 s on average (its
 * quiet tonic 0.1 third takes under 2 s). 7.5 would pay ~7% under the screen; 8 x PROGRAM_BONUS 1.01 keeps it even.
 */
export const ATLAS_UNITS = 8;

export interface AtlasInput { type: string; class: string; side: "L" | "R"; cells: number }

/**
 * Every named sensory type with cells on that side. A type counts for the class most of its cells are in, so a mostly
 * central type that has a stray sensory annotation stays out. Untyped cells have no name to drive; midline cells have
 * no side, so a side-driven job doesn't reach them.
 */
export function atlasInputs(meta: ConnectomeMeta): AtlasInput[] {
  const seen = new Map<string, { byClass: Map<string, number>; L: number; R: number }>();
  for (let i = 0; i < meta.n; i++) {
    const type = meta.types[meta.typeIdx[i]];
    if (!type) continue;
    const t = seen.get(type) ?? { byClass: new Map<string, number>(), L: 0, R: 0 };
    const cls = meta.superclasses[meta.classIdx[i]];
    t.byClass.set(cls, (t.byClass.get(cls) ?? 0) + 1);
    if (meta.side[i] === 1) t.L++;
    if (meta.side[i] === 2) t.R++;
    seen.set(type, t);
  }
  const out: AtlasInput[] = [];
  for (const [type, t] of seen) {
    const top = [...t.byClass].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    if (!INPUT_CLASSES.includes(top)) continue;
    for (const side of ["L", "R"] as const) if (t[side]) out.push({ type, class: top, side, cells: t[side] });
  }
  return out.sort((a, b) => INPUT_CLASSES.indexOf(a.class) - INPUT_CLASSES.indexOf(b.class) || a.type.localeCompare(b.type) || a.side.localeCompare(b.side));
}

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
interface Readout { set: string; type: string; side: string; columns: number[] }

/** Readout groups from a pulled layout.json: one per record set x cell type x side. */
export function readouts(layout: { sets: { name: string; neurons: { type: string; side: string }[] }[] }): Readout[] {
  const groups = new Map<string, Readout>();
  let column = 0;
  for (const set of layout.sets) {
    for (const n of set.neurons) {
      const key = `${set.name}\0${n.type}\0${n.side}`;
      const g = groups.get(key) ?? { set: set.name, type: n.type, side: n.side, columns: [] };
      g.columns.push(column++);
      groups.set(key, g);
    }
  }
  return [...groups.values()];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

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
  await write("input_class,input_type,input_side,input_cells,amount,readout_set,readout_type,readout_side,readout_cells,n_seeds,rest_hz,early_hz,late_hz,delta_hz,delta_sd_hz\n");
  const cell = (v: unknown) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  const inputOf = new Map(inputs.map((i) => [`${i.type}\0${i.side}`, i]));
  const totals = { orders: 0, conditions: 0, rows: 0, jobs: 0, seeds_min: Infinity, seeds_max: 0 };
  for (const part of readdirSync(root).sort()) {
    for (const id of readdirSync(join(root, part))) {
      const dir = join(root, part, id);
      const order = JSON.parse(readFileSync(join(dir, "order.json"), "utf8"));
      const { params, per_seed: perSeed } = order.spec;
      const groups = readouts(JSON.parse(readFileSync(join(dir, "outputs", "layout.json"), "utf8")));
      const width = groups.reduce((a, g) => a + g.columns.length, 0);
      // condition -> seed runs
      const runs = new Map<number, Uint16Array[]>();
      for (const line of readFileSync(join(dir, "results.jsonl"), "utf8").split("\n")) {
        if (!line) continue;
        const row = JSON.parse(line);
        const path = join(dir, "outputs", `${row.seq}.u16`);
        if (row.error || !existsSync(path)) continue;
        const b = readFileSync(path);
        if (b.length !== 3 * width * 2) throw new Error(`${path}: ${b.length} bytes, want ${3 * width * 2}`);
        const c = row.index % perSeed;
        runs.set(c, [...(runs.get(c) ?? []), new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))]);
        totals.jobs++;
      }
      totals.orders++;
      for (const [c, list] of [...runs].sort((a, b) => a[0] - b[0])) {
        const cond = params.conditions[c];
        const st = cond.stimuli[0];
        totals.conditions++;
        totals.seeds_min = Math.min(totals.seeds_min, list.length);
        totals.seeds_max = Math.max(totals.seeds_max, list.length);
        const input = st ? inputOf.get(`${st.types[0]}\0${st.side}`) : null;
        const head = st ? [input?.class ?? "", st.types[0], st.side, input?.cells ?? "", st.amount] : ["none", "none", "", 0, 0];
        const lines: string[] = [];
        for (const g of groups) {
          const secs = BIN_STEPS * DT_S * g.columns.length;
          const rate = (u: Uint16Array, bin: number) => { let s = 0; for (const col of g.columns) s += u[bin * width + col]; return s / secs; };
          const rest = list.map((u) => rate(u, 0)), early = list.map((u) => rate(u, 1)), late = list.map((u) => rate(u, 2));
          const delta = list.map((_, i) => (early[i] + late[i]) / 2 - rest[i]);
          lines.push([...head, g.set, g.type, g.side, g.columns.length, list.length, r3(mean(rest)), r3(mean(early)), r3(mean(late)), r3(mean(delta)), r3(sd(delta))].map(cell).join(","));
        }
        totals.rows += lines.length;
        await write(`${lines.join("\n")}\n`);
      }
    }
  }
  gz.end();
  await done;
  return totals.orders ? totals : null;
}
