/**
 * Runs Wiz's brain, the full connectome, off the main thread in real time (one 20 ms step per
 * 20 ms of wall clock, or as fast as it can if a step takes longer).
 *
 * in:  {type: "load", base}                      base URL of the `flybrain export --web` files
 *      {type: "input", drive: {LPLC2_L: 0.4, ...}}  voltage per step, held until the next input
 * out: {type: "progress", text} · {type: "ready", n, nnz, outputs} · {type: "error", text}
 *      {type: "rates", hz: number[], fired, ms, steps}  smoothed Hz per output group
 */
import { loadConnectome } from "./brainload.ts";
import { ConnectomeBrain, cells, cellsWithPrefix, type ConnectomeMeta } from "./connectome.ts";

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

const RATE_TAU = 0.18; // seconds, as in brain.ts

const WING_POWER = ["DLMn a, b", "DLMn c-f", "DVMn 1a-c", "DVMn 2a, b", "DVMn 3a, b"];
const LEG_EXTEND = ["Ti extensor MN", "Tr extensor MN", "Sternotrochanter MN"];
const LEG_FLEX = ["Ti flexor MN", "Acc. ti flexor MN", "Tr flexor MN", "Acc. tr flexor MN"];

function inputGroups(meta: ConnectomeMeta): Map<string, Int32Array> {
  const m = new Map<string, Int32Array>();
  for (const side of ["L", "R"] as const) {
    for (const type of ["LPLC2", "LC4", "LPLC1", "LC10a"]) m.set(`${type}_${side}`, cells(meta, [type], side));
    m.set(`SNta_${side}`, cellsWithPrefix(meta, "SNta", side));
  }
  return m;
}

function outputGroups(meta: ConnectomeMeta): [string, Int32Array][] {
  const out: [string, Int32Array][] = [];
  for (const side of ["L", "R"] as const) {
    for (const dn of ["DNg100", "DNa02", "DNp01", "MDN"]) out.push([`${dn} ${side}`, cells(meta, [dn], side)]);
    out.push([`wing power ${side}`, cells(meta, WING_POWER, side)]);
    out.push([`leg extend ${side}`, cells(meta, LEG_EXTEND, side)]);
    out.push([`leg flex ${side}`, cells(meta, LEG_FLEX, side)]);
    // Wiz's puppet strings: the descending neurons that actually fire for his senses (wiz/dnscreen.json)
    out.push([`arm pull ${side}`, cells(meta, ["DNp02", "DNp03", "DNp04", "DNp11", "DNg40"], side)]);
    out.push([`leg kick ${side}`, cells(meta, ["DNge104", "DNge122", "DNg20", "DNge102"], side)]);
    out.push([`head tug ${side}`, cells(meta, ["DNa05", "DNa07", "DNg111", "DNae002"], side)]);
  }
  return out;
}

let brain: ConnectomeBrain | null = null;
let inputs = new Map<string, Int32Array>();
let drive: Record<string, number> = {};

async function load(base: string): Promise<void> {
  const { meta, weights: w } = await loadConnectome(base, ctx, { label: "connectome" });
  brain = new ConnectomeBrain(w, meta.params, 64);
  inputs = inputGroups(meta);
  const outputs = outputGroups(meta);
  const groupOf = new Int16Array(meta.n).fill(-1);
  outputs.forEach(([, idx], g) => { for (const i of idx) groupOf[i] = g; });
  ctx.postMessage({ type: "ready", n: w.n, nnz: w.nnz, outputs: outputs.map(([name]) => name) });

  const b = brain;
  const dt = meta.params.dt;
  const a = Math.exp(-dt / RATE_TAU);
  const hz = new Float64Array(outputs.length);
  const count = new Float64Array(outputs.length);
  const hits = new Float64Array(outputs.length); // spikes per group since the last message
  let ms = 0;
  const loop = () => {
    const t0 = performance.now();
    for (const [key, idx] of inputs) {
      const amount = drive[key] ?? 0;
      if (amount > 0) b.stimulate(idx, amount);
    }
    b.step();
    count.fill(0);
    for (let k = 0; k < b.firedCount; k++) {
      const g = groupOf[b.fired[k]];
      if (g >= 0) count[g]++;
    }
    for (let g = 0; g < outputs.length; g++) {
      hz[g] = a * hz[g] + (1 - a) * count[g] / (outputs[g][1].length * dt);
      hits[g] += count[g];
    }
    const took = performance.now() - t0;
    ms += (took - ms) * 0.05;
    if (b.steps % 2 === 0) {
      ctx.postMessage({ type: "rates", hz: Array.from(hz), hits: Array.from(hits), fired: b.firedCount, ms, steps: b.steps });
      hits.fill(0);
    }
    setTimeout(loop, Math.max(0, dt * 1000 - took));
  };
  loop();
}

ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "load" && !brain) load(msg.base).catch((err) => ctx.postMessage({ type: "error", text: String(err) }));
  else if (msg.type === "input") drive = msg.drive;
};
