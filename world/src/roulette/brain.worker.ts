/**
 * Fly Roulette's brains, in the player's browser: the real connectome (the Simulation's files), one
 * ConnectomeBrain per fly at the table, kept between turns. On its turn a fly stares at the toy gun, feels the
 * trigger, and we count its wing-power and leg-flexor spikes (readout.ts). Steps are streamed so the page can
 * show the brain deciding.
 *
 * in:  {type: "load", base} · {type: "table", seeds: number[]} · {type: "turn", fly, chamber}
 * out: {type: "progress", text} · {type: "ready", n} · {type: "error", text}
 *      {type: "step", fly, wing, grip, gf, t}   running totals while it decides
 *      {type: "decided", fly, choice, wing, grip, gf}
 */
import { loadConnectome } from "../brainload.ts";
import { ConnectomeBrain, cells, type ConnectomeMeta, type ConnectomeWeights } from "../connectome.ts";
import { groups, runTurn } from "./readout.ts";

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

/** A fresh brain per seat, made when the fly first needs it. */
function brainOf(fly: number): ConnectomeBrain {
  if (!brains[fly]) brains[fly] = new ConnectomeBrain(weights!, meta!.params, seeds[fly] ?? fly + 1);
  return brains[fly];
}

function turn(fly: number, chamber: number): void {
  const c = runTurn(brainOf(fly), g!, chamber, (n, t) => ctx.postMessage({ type: "step", fly, ...n, t }));
  ctx.postMessage({ type: "decided", fly, ...c });
}

let loading: Promise<void> | null = null;
ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "load" && !loading) {
    loading = load(msg.base).catch((err) => ctx.postMessage({ type: "error", text: String(err) }));
  } else if (msg.type === "table") {
    seeds = msg.seeds;
    brains = [];
  } else if (msg.type === "turn") {
    void loading?.then(() => { if (weights) turn(msg.fly, msg.chamber); });
  }
};
