/**
 * Fly Race's brains, in the player's browser: the real connectome (the Simulation's files), one ConnectomeBrain
 * per lane, made fresh for each race from its seed and kept between legs. A leg is readout.ts runLeg: the fly
 * smells its lane's fruit and we count its odour-driven descending spikes. The running count is streamed so the
 * page's meters fill while the brain works. Nothing heavy ever runs on the page's main thread.
 *
 * in:  {type: "load", base} · {type: "table", seeds: number[]} · {type: "leg", lane, leg, intensity}
 * out: {type: "progress", text} · {type: "ready", n} · {type: "error", text}
 *      {type: "step", lane, spikes, t}     the running count while it smells (a few per leg)
 *      {type: "spikes", lane, leg, spikes} the leg's count
 */
import { loadConnectome } from "../brainload.ts";
import { ConnectomeBrain, cells, type ConnectomeMeta, type ConnectomeWeights } from "../connectome.ts";
import { groups, runLeg } from "./readout.ts";

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

let meta: ConnectomeMeta | null = null;
let weights: ConnectomeWeights | null = null;
let g: ReturnType<typeof groups> | null = null;
let brains: ConnectomeBrain[] = [];
let seeds: number[] = [];

async function load(base: string): Promise<void> {
  ({ meta, weights } = await loadConnectome(base, ctx));
  g = groups(meta, cells);
  ctx.postMessage({ type: "ready", n: weights.n });
}

/** A fresh brain per lane, made when the fly first needs it (the same as the server: seed = the lane's draw). */
function brainOf(lane: number): ConnectomeBrain {
  if (!brains[lane]) brains[lane] = new ConnectomeBrain(weights!, meta!.params, seeds[lane] ?? lane + 1);
  return brains[lane];
}

function leg(lane: number, legNo: number, intensity: number): void {
  let last = -1;
  const spikes = runLeg(brainOf(lane), g!, intensity, (n, t) => {
    // a handful of updates per leg is plenty for a meter
    if (n !== last && (t >= 1 || Math.round(t * 20) % 4 === 0)) { last = n; ctx.postMessage({ type: "step", lane, spikes: n, t }); }
  });
  ctx.postMessage({ type: "spikes", lane, leg: legNo, spikes });
}

let loading: Promise<void> | null = null;
ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "load" && !loading) {
    loading = load(msg.base).catch((err) => ctx.postMessage({ type: "error", text: String(err) }));
  } else if (msg.type === "table") {
    seeds = msg.seeds;
    brains = [];
  } else if (msg.type === "leg") {
    void loading?.then(() => { if (weights) leg(msg.lane, msg.leg, msg.intensity); });
  }
};
