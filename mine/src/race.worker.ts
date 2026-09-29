/**
 * Fly Race's bet races, played on the server: the float connectome (world/src/connectome.ts, the same engine and
 * the same leg code as the page, world/src/race/readout.ts) and the rules in world/src/race/game.ts. Live races
 * share this thread one brain window at a time, first come first served, so every race keeps moving (round robin).
 * A race restarted after a server restart replays from its seeds to the same events.
 *
 * in:  {type: "start", race, serverSeed, clientSeed}
 * out: {type: "ready"} · {type: "event", race, seq, event} · {type: "error", race, text}
 */
import { parentPort, workerData } from "node:worker_threads";
import { ConnectomeBrain, cells } from "../../world/src/connectome.ts";
import { deriveRng, playRace, setupRace } from "../../world/src/race/game.ts";
import { groups, runLeg } from "../../world/src/race/readout.ts";
import { loadModel } from "./load.ts";

const port = parentPort!;
const model = loadModel(workerData.dir as string);
const g = groups(model.meta, cells);
port.postMessage({ type: "ready" });

// one brain window at a time across all live races, first come first served
const waiting: (() => void)[] = [];
let busy = false;
function next(): void {
  const go = waiting.shift();
  if (!go) { busy = false; return; }
  busy = true;
  go();                                   // the race's window runs in the microtasks after this
  setImmediate(next);
}
const slot = () => new Promise<void>((resolve) => {
  waiting.push(resolve);
  if (!busy) { busy = true; setImmediate(next); }
});

const playing = new Set<string>();
async function play(race: string, serverSeed: string, clientSeed: string): Promise<void> {
  const rng = await deriveRng(serverSeed, clientSeed);
  const table = setupRace(rng);
  // six brains of ~4 MB each, made when needed and dropped with the race
  const brains: ConnectomeBrain[] = [];
  let seq = 0;
  for await (const event of playRace(table, rng, async (lane, _leg, intensity) => {
    await slot();
    return runLeg(brains[lane] ??= new ConnectomeBrain(model.w, model.meta.params, table.seeds[lane]), g, intensity);
  })) {
    port.postMessage({ type: "event", race, seq: seq++, event });
  }
}

port.on("message", (msg: { type: "start"; race: string; serverSeed: string; clientSeed: string }) => {
  if (msg.type !== "start" || playing.has(msg.race)) return;
  playing.add(msg.race);
  play(msg.race, msg.serverSeed, msg.clientSeed)
    .catch((err) => port.postMessage({ type: "error", race: msg.race, text: String(err) }))
    .finally(() => playing.delete(msg.race));
});
