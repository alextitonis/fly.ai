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
import { ConnectomeBrain, cells, parseMeta, parseWeights, type ConnectomeMeta, type ConnectomeWeights } from "../connectome.ts";
import { groups, runRound } from "./readout.ts";

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

/** One gzip stream in one or more parts (see connectome.worker.ts): join, then decompress if still gzipped. */
async function fetchGz(urls: string[], label: string, totalMb = 0): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  let got = 0, lastReport = 0;
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      if (got - lastReport > 1_000_000) {
        lastReport = got;
        ctx.postMessage({ type: "progress", text: `${label} ${(got / 1e6).toFixed(0)}${totalMb ? ` / ${totalMb.toFixed(0)}` : ""} MB` });
      }
    }
  }
  const blob = new Blob(chunks as BlobPart[]);
  if (!(chunks[0]?.[0] === 0x1f && chunks[0]?.[1] === 0x8b)) return blob.arrayBuffer();
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

let meta: ConnectomeMeta | null = null;
let weights: ConnectomeWeights | null = null;
let g: ReturnType<typeof groups> | null = null;
let brains: (ConnectomeBrain | null)[] = [null, null];
let seeds: number[] = [1, 2];

async function load(base: string): Promise<void> {
  const res = await fetch(`${base}brain.json`);
  if (!res.ok) throw new Error(`${base}brain.json: HTTP ${res.status}`);
  const info: { parts: string[]; weights_mb: number } = await res.json();
  meta = parseMeta(await fetchGz([`${base}meta.bin`], "labels"));
  const buf = await fetchGz(info.parts.map((p) => base + p), "fly brain", info.weights_mb);
  ctx.postMessage({ type: "progress", text: "wiring 25 M synapses" });
  weights = parseWeights(buf);
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
