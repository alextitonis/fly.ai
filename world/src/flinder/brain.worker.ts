/**
 * Flinder's brains, in the viewer's browser: the real connectome (the Simulation's files). The swiping fly keeps
 * one ConnectomeBrain for its whole session; a profile it likes gets a brain of its own to judge the swiper back
 * (a match takes both), kept while they chat. Steps are streamed so the page can show the brain deciding.
 *
 * in:  {type: "load", base} · {type: "swiper", seed}
 *      {type: "swipe", id, traits}             the swiper looks at a profile
 *      {type: "judge", id, seed, traits}       a profile's own brain looks at the swiper
 *      {type: "chat", id, reader, traits, msg}  "swiper" or "match" (profile id's brain) reads a message
 *      {type: "forget", id}                     the chat is over: drop that profile's brain
 *      {type: "revive", id, seed}               an ex comes back: a fresh brain for that profile
 * out: {type: "progress", text} · {type: "ready", n} · {type: "error", text}
 *      {type: "step", id, heart, vpo, t}       running totals while the swiper decides
 *      {type: "decided", id, heart, vpo, choice, judge}
 *      {type: "replied", id, reader, heart, gf, groom, reply}
 */
import { loadConnectome } from "../brainload.ts";
import { ConnectomeBrain, cells, type ConnectomeMeta, type ConnectomeWeights } from "../connectome.ts";
import { chatGroups, groups, runReply, runSwipe, type Traits } from "./readout.ts";

const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

let meta: ConnectomeMeta | null = null;
let weights: ConnectomeWeights | null = null;
let g: ReturnType<typeof groups> | null = null;
let cg: ReturnType<typeof chatGroups> | null = null;
/** the brains of profiles that judged the swiper, by profile id, until their chat ends */
const others = new Map<number, ConnectomeBrain>();
let swiper: ConnectomeBrain | null = null;
let swiperSeed = 1;

async function load(base: string): Promise<void> {
  ({ meta, weights } = await loadConnectome(base, ctx));
  g = groups(meta, cells);
  cg = chatGroups(meta, cells, g);
  ctx.postMessage({ type: "ready", n: weights.n });
}

let loading: Promise<void> | null = null;
ctx.onmessage = (e: MessageEvent) => {
  const msg = e.data;
  if (msg.type === "load" && !loading) {
    loading = load(msg.base).catch((err) => ctx.postMessage({ type: "error", text: String(err) }));
  } else if (msg.type === "swiper") {
    swiperSeed = msg.seed;
    swiper = null;
    others.clear();
  } else if (msg.type === "revive") {
    void loading?.then(() => { if (weights) others.set(msg.id, new ConnectomeBrain(weights, meta!.params, msg.seed)); });
  } else if (msg.type === "forget") {
    others.delete(msg.id);
  } else if (msg.type === "chat") {
    void loading?.then(() => {
      if (!weights) return;
      const b = msg.reader === "swiper" ? (swiper ??= new ConnectomeBrain(weights, meta!.params, swiperSeed)) : others.get(msg.id);
      if (!b) return;
      ctx.postMessage({ type: "replied", id: msg.id, reader: msg.reader, ...runReply(b, cg!, msg.traits as Traits, msg.msg) });
    });
  } else if (msg.type === "swipe" || msg.type === "judge") {
    void loading?.then(() => {
      if (!weights) return;
      const judge = msg.type === "judge";
      const b = judge ? new ConnectomeBrain(weights, meta!.params, msg.seed) : (swiper ??= new ConnectomeBrain(weights, meta!.params, swiperSeed));
      if (judge) others.set(msg.id, b);
      const c = runSwipe(b, g!, msg.traits as Traits, judge ? undefined : (n, t) => ctx.postMessage({ type: "step", id: msg.id, ...n, t }));
      ctx.postMessage({ type: "decided", id: msg.id, judge, ...c });
    });
  }
};
