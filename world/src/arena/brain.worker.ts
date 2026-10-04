/**
 * Fly Colosseum's brains, in the visitor's browser: the real connectome (the Simulation's files), one
 * ConnectomeBrain per fighter, made fresh for each fight from its seed and kept between rounds. A round is
 * readout.ts runRound: the fly smells its rival and sees it charge, and we count its charge and escape spikes.
 * Used for sparring and for Verify (replaying a tournament fight). Nothing heavy ever runs on the page's main thread.
 *
 * in:  {type: "load", base} · {type: "fight", seeds: [number, number]} · {type: "round", side, scent, loom}
 * out: {type: "progress", text} · {type: "ready", n} · {type: "error", text}
 *      {type: "counts", side, charge, escape}   the round's spike counts
 */
import { loadConnectome } from "../brainload.ts";
import { ConnectomeBrain, cells, type ConnectomeMeta, type ConnectomeWeights } from "../connectome.ts";
import { groups, runRound } from "./readout.ts";

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

let meta: ConnectomeMeta | null = null;
let weights: ConnectomeWeights | null = null;
let g: ReturnType<typeof groups> | null = null;
let brains: (ConnectomeBrain | null)[] = [null, null];
let seeds: number[] = [1, 2];

async function load(base: string): Promise<void> {
  ({ meta, weights } = await loadConnectome(base, ctx));
  g = groups(meta, cells);
  ctx.postMessage({ type: "ready", n: weights.n });
}

function round(side: number, scent: number, loom: number): void {
  // a fresh brain per fighter, made when it first needs it (the same as the server: seed = the fight's draw)
  const brain = brains[side] ??= new ConnectomeBrain(weights!, meta!.params, seeds[side]);
  ctx.postMessage({ type: "counts", side, ...runRound(brain, g!, scent, loom) });
}

let loading: Promise<void> | null = null;
ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "load" && !loading) {
    loading = load(msg.base).catch((err) => ctx.postMessage({ type: "error", text: String(err) }));
  } else if (msg.type === "fight") {
    seeds = msg.seeds;
    brains = [null, null];
  } else if (msg.type === "round") {
    void loading?.then(() => { if (weights) round(msg.side, msg.scent, msg.loom); });
  }
};
