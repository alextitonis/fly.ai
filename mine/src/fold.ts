/**
 * Turning a finished probe order's outputs into a results table. Used by the server when an order finishes
 * (src/pack.worker.ts) and by scripts/atlas.ts on a local pull. A probe output is u16 spike counts, bins x neurons, over
 * the record sets in order.
 *
 * Atlas orders get the atlas's own columns (rest | early | late, mine/dataset/ATLAS.md). Any other probe order gets one
 * row per condition x readout group, with mean and sd over the seeds for each bin.
 */
import type { ConnectomeMeta } from "../../world/src/connectome.ts";

export const ATLAS_PREFIX = "atlas/sensory-dn-1";
const INPUT_CLASSES = ["cb_sensory", "vnc_sensory", "sensory_ascending", "ol_sensory", "visual_projection"];
const DT_S = 0.02;

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

export interface Readout { set: string; type: string; side: string; columns: number[] }
export interface Layout { sets: { name: string; neurons: { type: string; side: string }[] }[] }

/** Readout groups from a probe layout: one per record set x cell type x side. */
export function readouts(layout: Layout): Readout[] {
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
export const csvCell = (v: unknown) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export const ATLAS_HEADER = "input_class,input_type,input_side,input_cells,amount,readout_set,readout_type,readout_side,readout_cells,n_seeds,rest_hz,early_hz,late_hz,delta_hz,delta_sd_hz";

/** condition number -> that condition's seed runs */
export type Runs = Map<number, Uint16Array[]>;
export interface OrderSpec { params: { conditions: { name: string; stimuli: any[] }[]; steps: number; bin_steps?: number }; per_seed: number }

/** One order's atlas rows. Rates are spikes per neuron per second, per seed, then mean and sd over the seeds. */
export function atlasLines(spec: OrderSpec, groups: Readout[], runs: Runs, inputs: AtlasInput[]): string[] {
  const inputOf = new Map(inputs.map((i) => [`${i.type}\0${i.side}`, i]));
  const binSteps = spec.params.bin_steps ?? spec.params.steps;
  const width = groups.reduce((a, g) => a + g.columns.length, 0);
  const lines: string[] = [];
  for (const [c, list] of [...runs].sort((a, b) => a[0] - b[0])) {
    const st = spec.params.conditions[c].stimuli[0];
    const input = st ? inputOf.get(`${st.types[0]}\0${st.side}`) : null;
    const head = st ? [input?.class ?? "", st.types[0], st.side, input?.cells ?? "", st.amount] : ["none", "none", "", 0, 0];
    for (const g of groups) {
      const secs = binSteps * DT_S * g.columns.length;
      const rate = (u: Uint16Array, bin: number) => { let s = 0; for (const col of g.columns) s += u[bin * width + col]; return s / secs; };
      const rest = list.map((u) => rate(u, 0)), early = list.map((u) => rate(u, 1)), late = list.map((u) => rate(u, 2));
      const delta = list.map((_, i) => (early[i] + late[i]) / 2 - rest[i]);
      lines.push([...head, g.set, g.type, g.side, g.columns.length, list.length, r3(mean(rest)), r3(mean(early)), r3(mean(late)), r3(mean(delta)), r3(sd(delta))].map(csvCell).join(","));
    }
  }
  return lines;
}

/** Any other probe order: its header and rows, with hz_binN and sd_binN per bin. */
export function probeTable(spec: OrderSpec, groups: Readout[], runs: Runs): { header: string; lines: string[] } {
  const { steps, conditions } = spec.params;
  const binSteps = spec.params.bin_steps ?? steps;
  const bins = Math.ceil(steps / binSteps);
  const width = groups.reduce((a, g) => a + g.columns.length, 0);
  const binNames = Array.from({ length: bins }, (_, b) => b);
  const header = ["condition", "stimuli", "readout_set", "readout_type", "readout_side", "readout_cells", "n_seeds",
    ...binNames.map((b) => `hz_bin${b}`), ...binNames.map((b) => `sd_bin${b}`)].join(",");
  const lines: string[] = [];
  for (const [c, list] of [...runs].sort((a, b) => a[0] - b[0])) {
    for (const g of groups) {
      const perBin = binNames.map((b) => {
        const secs = Math.min(binSteps, steps - b * binSteps) * DT_S * g.columns.length;
        return list.map((u) => { let s = 0; for (const col of g.columns) s += u[b * width + col]; return s / secs; });
      });
      lines.push([conditions[c].name, JSON.stringify(conditions[c].stimuli), g.set, g.type, g.side, g.columns.length, list.length,
        ...perBin.map((xs) => r3(mean(xs))), ...perBin.map((xs) => r3(sd(xs)))].map(csvCell).join(","));
    }
  }
  return { header, lines };
}

/** What a fold read, for the dataset's meta.json. */
export function runTotals(runs: Runs): { conditions: number; jobs: number; seeds_min: number; seeds_max: number } {
  const sizes = [...runs.values()].map((l) => l.length);
  return { conditions: sizes.length, jobs: sizes.reduce((a, b) => a + b, 0), seeds_min: sizes.length ? Math.min(...sizes) : 0, seeds_max: sizes.length ? Math.max(...sizes) : 0 };
}
