/**
 * Fly Colosseum: what a fighting fly senses and what we read back. Shared by the page's worker (brain.worker.ts),
 * the tournament server (mine/src/arena.worker.ts) and tools/arena.ts, so a round is computed identically everywhere.
 *
 * In:  the rival's smell, on the olfactory receptor neurons of the four fly-pheromone glomeruli (ORN_DA1 and DL3,
 *      the male pheromone cVA; VA1v and VA1d, fly cuticle odours), a voltage per step equal to the round's scent;
 *      and the rival charging at it, a looming shape on both eyes (LPLC2 + LC4), bigger the harder the rival charged.
 * Out: two groups of descending neurons, found by screening every descending and motor cell type against each
 *      stimulus (tools/arena.ts --screen):
 *      charge  the brain's odour-driven command to the body (DNc01, DNc02, DNb05, DNp32, DNp62, DNpe002, DNp29):
 *              how hard the fly goes at the rival;
 *      escape  the looming-driven escape command (the giant fibre DNp01, and DNp02, DNp04, DNp11, DNp103, DNg40,
 *              DNp03, DNp06): how hard it jumps out of the way.
 *      We count each group's spikes over the window. What a spike is worth in damage or in dodging is the fighter's
 *      stats (stats.ts) in the rules (game.ts); the counts themselves come from the wiring.
 */
import type { ConnectomeBrain, ConnectomeMeta } from "../connectome.ts";

export const READOUT = {
  warmSteps: 5,         // 0.1 s: the rival comes into range before we count
  windowSteps: 20,      // 0.4 s: one exchange
};

export const RIVAL_ORNS = ["ORN_DA1", "ORN_DL3", "ORN_VA1v", "ORN_VA1d"];
export const LOOM_CELLS = ["LPLC2", "LC4"];
export const CHARGE_DNS = ["DNc01", "DNc02", "DNb05", "DNp32", "DNp62", "DNpe002", "DNp29"];
export const ESCAPE_DNS = ["DNp01", "DNp02", "DNp04", "DNp11", "DNp103", "DNg40", "DNp03", "DNp06"];

type CellsFn = (meta: ConnectomeMeta, names: string[], side?: "L" | "R") => Int32Array;
export function groups(meta: ConnectomeMeta, cells: CellsFn) {
  const mark = (idx: Int32Array) => { const m = new Uint8Array(meta.n); for (const i of idx) m[i] = 1; return m; };
  return {
    scent: cells(meta, RIVAL_ORNS), loom: cells(meta, LOOM_CELLS),
    isCharge: mark(cells(meta, CHARGE_DNS)), isEscape: mark(cells(meta, ESCAPE_DNS)),
  };
}

export type Groups = ReturnType<typeof groups>;
export interface Counts { charge: number; escape: number }

/**
 * One round of one fly, on its own brain (which keeps its state from earlier rounds): it smells the rival at `scent`
 * and sees it loom at `loom`, then we count its charge and escape spikes. onStep sees the running counts after each
 * counted step (t from 0 to 1).
 */
export function runRound(b: ConnectomeBrain, g: Groups, scent: number, loom: number, onStep?: (n: Counts, t: number) => void): Counts {
  const s = Math.max(0, scent), l = Math.max(0, loom);
  for (let k = 0; k < READOUT.warmSteps; k++) { b.stimulate(g.scent, s); b.stimulate(g.loom, l); b.step(); }
  const n = { charge: 0, escape: 0 };
  for (let k = 0; k < READOUT.windowSteps; k++) {
    b.stimulate(g.scent, s);
    b.stimulate(g.loom, l);
    b.step();
    for (let q = 0; q < b.firedCount; q++) { const i = b.fired[q]; n.charge += g.isCharge[i]; n.escape += g.isEscape[i]; }
    onStep?.(n, (k + 1) / READOUT.windowSteps);
  }
  return n;
}
