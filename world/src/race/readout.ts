/**
 * Fly Race: what a racing fly smells and what we read back. Shared by the page's worker (brain.worker.ts), the
 * betting server (mine/src/race.worker.ts) and tools/race.ts, so a leg is computed identically everywhere.
 *
 * In:  the smell of fruit down the fly's lane, on the olfactory receptor neurons of seven fruit and vinegar
 *      glomeruli (ORN_DM1 ethyl acetate, DM2, DM4, VA2, VM5d esters, VL2a and DP1m acids), a voltage per step
 *      equal to the lane's odour intensity for the leg (plus the fly's own whiff of plume noise, see game.ts).
 * Out: the descending neurons that the fruit smell drives in this connectome: a screen of every descending and
 *      motor cell type (tools/race.ts --screen) for the ones whose spikes rise with the smell, the brain's own
 *      odour-driven command to the body (DNb05, the odour-steering DN, and DNc01/DNc02, DNp32, DNg30, DNp12,
 *      DNg104, DNp29, DNge137; 19 neurons). We count their spikes over the window.
 * The distance a fly covers in a leg is a fixed monotone function of that count (distanceFor). No game rule
 * decides who is fast: the wiring's response to the smell does.
 */
import type { ConnectomeBrain, ConnectomeMeta } from "../connectome.ts";

export const READOUT = {
  warmSteps: 5,         // 0.1 s: the new whiff reaches the antennae before we count
  windowSteps: 20,      // 0.4 s: one leg of the race
  stride: 0.4375,       // track units per descending spike (7/16: a binary fraction, so sums stay exact)
};

export const FRUIT_ORNS = ["ORN_DM1", "ORN_DM2", "ORN_DM4", "ORN_VA2", "ORN_VM5d", "ORN_VL2a", "ORN_DP1m"];
export const ODOUR_DNS = ["DNb05", "DNc01", "DNc02", "DNp32", "DNg30", "DNp12", "DNg104", "DNp29", "DNge137"];

/** How far a fly goes in a leg for `spikes` odour-driven descending spikes: STRIDE per spike, never negative. */
export const distanceFor = (spikes: number) => Math.max(0, spikes) * READOUT.stride;

type CellsFn = (meta: ConnectomeMeta, names: string[], side?: "L" | "R") => Int32Array;
export function groups(meta: ConnectomeMeta, cells: CellsFn) {
  const mark = (idx: Int32Array) => { const m = new Uint8Array(meta.n); for (const i of idx) m[i] = 1; return m; };
  return { smell: cells(meta, FRUIT_ORNS), isRun: mark(cells(meta, ODOUR_DNS)) };
}

export type Groups = ReturnType<typeof groups>;

/**
 * One leg of one fly, on its own brain (which keeps its state from earlier legs): it smells its lane's fruit at
 * `intensity`, then we count its odour-driven descending spikes. onStep sees the running count after each
 * counted step (t from 0 to 1).
 */
export function runLeg(b: ConnectomeBrain, g: Groups, intensity: number, onStep?: (spikes: number, t: number) => void): number {
  const amp = Math.max(0, intensity);
  for (let k = 0; k < READOUT.warmSteps; k++) { b.stimulate(g.smell, amp); b.step(); }
  let spikes = 0;
  for (let k = 0; k < READOUT.windowSteps; k++) {
    b.stimulate(g.smell, amp);
    b.step();
    for (let q = 0; q < b.firedCount; q++) spikes += g.isRun[b.fired[q]];
    onStep?.(spikes, (k + 1) / READOUT.windowSteps);
  }
  return spikes;
}
