/**
 * Fly Colosseum's fights, played on the server: the float connectome (world/src/connectome.ts, the same engine and
 * the same round code as the page, world/src/arena/readout.ts) and the rules in world/src/arena/game.ts. A tournament
 * is played fight by fight in bracket order, each on two fresh brains made from the fight's own seeds; tournaments
 * queue one behind the other. One restarted after a server restart replays from its seeds to the same fights.
 *
 * in:  {type: "start", tournament, serverSeed, digest, entrants: [{fly, stats}]}
 * out: {type: "ready"} · {type: "match", tournament, match} · {type: "podium", tournament, places} · {type: "error", tournament, text}
 */
import { parentPort, workerData } from "node:worker_threads";
import { ConnectomeBrain, cells } from "../../world/src/connectome.ts";
import { playTournament, runFight } from "../../world/src/arena/game.ts";
import { groups, runRound } from "../../world/src/arena/readout.ts";
import type { Stats } from "../../world/src/arena/stats.ts";
import { loadModel } from "./load.ts";

const port = parentPort!;
const model = loadModel(workerData.dir as string);
const g = groups(model.meta, cells);
port.postMessage({ type: "ready" });

interface Start { type: "start"; tournament: string; serverSeed: string; digest: string; entrants: { fly: number; stats: Stats }[] }

async function play(msg: Start): Promise<void> {
  const stats = new Map(msg.entrants.map((e) => [e.fly, e.stats]));
  const flies = msg.entrants.map((e) => e.fly);
  for await (const e of playTournament(flies, msg.serverSeed, msg.digest, async (label, a, b) => {
    // between fights the thread lets go, so a second tournament's start message is at least received
    await new Promise((r) => setImmediate(r));
    return runFight(msg.serverSeed, msg.digest, label, [stats.get(a)!, stats.get(b)!], (seed) => {
      const brain = new ConnectomeBrain(model.w, model.meta.params, seed);
      return (scent, loom) => runRound(brain, g, scent, loom);
    });
  })) {
    if (e.type === "match") { const { type: _t, ...match } = e; port.postMessage({ type: "match", tournament: msg.tournament, match }); }
    else port.postMessage({ type: "podium", tournament: msg.tournament, places: e.places });
  }
}

const playing = new Set<string>();
let queue: Promise<void> = Promise.resolve();
port.on("message", (msg: Start) => {
  if (msg.type !== "start" || playing.has(msg.tournament)) return;
  playing.add(msg.tournament);
  queue = queue.then(() => play(msg))
    .catch((err) => port.postMessage({ type: "error", tournament: msg.tournament, text: String(err) }))
    .finally(() => { playing.delete(msg.tournament); });
});
